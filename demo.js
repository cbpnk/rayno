import {Editor} from "./rayno.js";

const Text = {
    view(vnode) {
        return vnode.children;
    }
};

const Paragraph = {
    view(vnode) {
        return m("p", vnode.children, m("br"));
    }
};

const TAGS = {
    paragraph: Paragraph,
};

function render(node) {
    if (node.tag === 'text') {
        return m(Text,
                 node.attrs || {},
                 node.contents);
    } else {
        return m(TAGS[node.tag],
                 node.attrs || {},
                 (node.contents || []).map((node) => render(node)));
    }
}

function onload() {

    const doc = {
        contents: [
            {tag: "paragraph",
             contents: [
                 {tag: "text",
                  contents: ""}
             ]
            }
        ]
    };

    m.mount(
        document.getElementById("editor"),
        {
            view(vnode) {
                return m(Editor, {doc, render});
            }
        }
    );
}

window.addEventListener('load', onload);
