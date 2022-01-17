const {createPopper} = Popper;
const {produce} = immer;

function resolve_path(vnode, node, offset) {
    const path = [];

    while (node !== vnode.dom) {
        const index = vnode.children.findIndex((child) => child.dom.contains(node));
        path.push(index);
        vnode = vnode.children[index];
    }

    path.push(offset);
    return path;
}

function get_selection_range(vnode) {
    const sel = document.getSelection().getRangeAt(0);
    const sourceRange = document.createRange();
    sourceRange.selectNodeContents(vnode.dom);

    if (sel.compareBoundaryPoints(Range.START_TO_END, sourceRange) <= 0)
        return;

    if (sel.compareBoundaryPoints(Range.END_TO_START, sourceRange) >= 0)
        return;

    if (sel.collapsed) {
        const start = resolve_path(vnode, sel.startContainer, sel.startOffset);
        return {start, end: start};
    }

    return {
        start: resolve_path(vnode, sel.startContainer, sel.startOffset),
        end: resolve_path(vnode, sel.endContainer, sel.endOffset),
    };
}

function lookup(vnode, path) {
    return path.reduce((n, i) => n.children[i], vnode);
}

const Container = {
    view(vnode) {
        return m("div",
                 {
                     oncompositionstart(event) {
                         const range = get_selection_range(vnode);
                         if (range.start !== range.end)
                             vnode.attrs.deleteRange(range);
                     },

                     oncompositionend(event) {
                         const range = get_selection_range(vnode);
                         vnode.attrs.insertText(range, event.data);
                     },

                     onbeforeinput(event) {
                         if (event.isComposing) return;
                         event.preventDefault();

                         let inputType = event.inputType;

                         switch(inputType) {
                         case "insertText":
                             vnode.attrs.insertText(get_selection_range(vnode), event.data);
                             return;
                         case "deleteContentForward":
                         case "deleteContentBackward":
                             document.getSelection().modify('extend', inputType.slice(13).toLowerCase(), 'character');
                             inputType = "deleteRange";
                         default:
                             vnode.attrs[inputType](get_selection_range(vnode));
                             return;
                         }
                     }
                 },
                 vnode.children);
    },

    oncreate(vnode) {
        const elem = vnode.dom;
        elem.setAttribute("contenteditable", "true");
        vnode.state.range = null;
    },

    onupdate(vnode) {
        const range = vnode.attrs.range;
        if ((range) && (range !== vnode.state.range)) {
            const sel = document.getSelection();
            sel.setBaseAndExtent(
                lookup(vnode, range.start.slice(0, -1)).dom,
                range.start.slice(-1)[0],
                lookup(vnode, range.end.slice(0, -1)).dom,
                range.end.slice(-1)[0]);
            vnode.state.range = range;
        }
    }
};

function deleteRange(node, start, end) {
    const start_index = start[0];
    const end_index = end[0];
    const contents = node.contents;
    if (node.tag === "text") {
        node.contents = contents.slice(0, start_index) + contents.slice(end_index);
        return [start_index];
    }


    const start_node = contents[start_index];

    if (start_index === end_index) {
        const path = deleteRange(start_node, start.slice(1), end.slice(1));
        path.unshift(start_index);
        return path;
    }

    const end_node = contents[end_index];

    if (start_node.tag === end_node.tag) {
        contents.splice(start_index + 1, end_index - start_index);
        const end_path = [start_node.contents.length + end[1]].concat(end.slice(2));
        if (start_node.tag === "text") {
            start_node.contents = start_node.contents + end_node.contents;
        } else {
            start_node.contents.push(...end_node.contents);
        }
        const path = deleteRange(
            start_node,
            start.slice(1),
            end_path
        );
        path.unshift(start_index);
        return path;
    }
}

function insertText(node, path, text) {
    const index = path[0];
    const contents = node.contents;
    if (node.tag === "text") {
        const index = path[0];
        node.contents = contents.slice(0, index) + text + contents.slice(index);
        return [index + text.length];
    }

    if (path.length > 1) {
        const result = insertText(contents[index], path.slice(1), text);
        result.unshift(index);
        return result;
    }

    const length = contents.length;

    if ((length > 0) && (index === length)) {
        const child = contents[index-1];
        const result = insertText(child, [child.contents.length], text);
        result.unshift(index - 1);
        return result;
    }

    const result = insertText(contents[index], [0], text);
    result.unshift(index);
    return result;
}

function splitParagraph(node, path) {
    const contents = node.contents;
    const index = path[0];
    if (node.tag === "text") {
        return {
            nodes: [
                {tag: "text",
                 attrs: node.attrs,
                 contents: contents.slice(0, index)},
                {tag: "text",
                 attrs: node.attrs,
                 contents: contents.slice(index)},
            ],
            path: [0]
        };
    }

    const child = contents[index];
    const result = splitParagraph(child, path.slice(1));

    if (!result.nodes) {
        return {path: [index].concat(result.path)};
    }

    if (child.tag !== "paragraph") {
        return {
            nodes: [{tag: node.tag,
                     attrs: node.attrs,
                     contents: contents.slice(0, index).concat([result.nodes[0]])
                    },
                    {tag: "paragraph",
                     contents: [result.nodes[1]].concat(contents.slice(index + 1))
                    }],
            path: [0].concat(result.path),
        };
    }

    contents.splice(index, 1, result.nodes[0], result.nodes[1]);
    return {path: [index+1].concat(result.path)};
}

function insertParagraph(node, path) {
    return splitParagraph(node, path).path;
}

export const Editor = {
    oninit(vnode) {
        vnode.state.doc = vnode.attrs.doc;
        vnode.state.range = null;
    },

    view(vnode) {
        const doc = vnode.state.doc;
        return m(Container,
                 {
                     range: vnode.state.range,
                     deleteRange(range) {
                         vnode.state.doc = produce(
                             doc,
                             function(draft) {
                                 const path = deleteRange(draft, range.start, range.end);
                                 vnode.state.range = {start: path, end: path};
                             }
                         );
                     },

                     insertText(range, data) {
                         vnode.state.doc = produce(
                             doc,
                             function(draft) {
                                 let start = range.start;
                                 if (start !== range.end) {
                                     start = deleteRange(draft, start, range.end);
                                 }
                                 const path = insertText(draft, start, data);
                                 vnode.state.range = {start: path, end: path};
                             }
                         );
                     },

                     insertParagraph(range) {
                         vnode.state.doc = produce(
                             doc,
                             function(draft) {
                                 let start = range.start;
                                 if (start !== range.end) {
                                     start = deleteRange(draft, start, range.end);
                                 }
                                 const path = insertParagraph(draft, start);
                                 vnode.state.range = {start: path, end: path};
                             }
                         );
                     },
                 },
                 doc.contents.map(vnode.attrs.render));
    }
};
