/**
 * Milkdown ProseMirror plugin: inline decorations for [[wikilinks]].
 *
 * - Doesn't modify the schema — markdown serializes back as plain text.
 * - Adds `class="mf-wikilink" data-target="name"` to the matched range.
 * - Click handling is done by a delegated DOM listener (Cmd/Ctrl+click → open).
 */

import { $prose } from "@milkdown/utils";
import { Plugin, PluginKey } from "@milkdown/prose/state";
import { Decoration, DecorationSet } from "@milkdown/prose/view";
import type { Node as PMNode } from "@milkdown/prose/model";

const WIKILINK_RE = /\[\[([^\]\n[]+)\]\]/g;

function findWikilinkDecos(doc: PMNode): DecorationSet {
  const decos: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return;
    const text = node.text;
    WIKILINK_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = WIKILINK_RE.exec(text)) !== null) {
      const inner = m[1];
      const name = inner.split("|")[0].trim().replace(/\.md$/i, "");
      if (!name) continue;
      const from = pos + m.index;
      const to = from + m[0].length;
      decos.push(
        Decoration.inline(from, to, {
          class: "mf-wikilink",
          "data-target": name,
        }),
      );
    }
  });
  return DecorationSet.create(doc, decos);
}

const wikilinkKey = new PluginKey("mf-wikilink");

export const wikilinkPlugin = $prose(
  () =>
    new Plugin({
      key: wikilinkKey,
      state: {
        init: (_config, { doc }) => findWikilinkDecos(doc),
        apply: (tr, old) =>
          tr.docChanged ? findWikilinkDecos(tr.doc) : old,
      },
      props: {
        decorations(state) {
          return wikilinkKey.getState(state);
        },
      },
    }),
);
