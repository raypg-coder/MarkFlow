/**
 * Milkdown ProseMirror plugin: Tufte-style margin sidenotes.
 *
 * Syntax (markdown-safe; serializes back as plain text):
 *   Main text ^[a quiet note in the right margin] more text.
 *
 * What this plugin does:
 *  - Detects `^[...]` inline.
 *  - Hides the `^[` opener and `]` closer via decorations carrying class
 *    `mf-sidenote-bracket` (CSS sets `display: none`).
 *  - Wraps the inner note text with class `mf-sidenote`.
 *    CSS in index.css then floats it into the right margin on wide
 *    screens, or inlines it as italic-serif aside on narrow ones.
 *  - Nothing changes the document schema — the markdown round-trips
 *    exactly, so this is invisible to external tools.
 *
 * Like milkdown-tag.ts, decorations are recomputed only when a tx
 * touches `^`, `[`, or `]` characters.
 */
import { $prose } from "@milkdown/utils";
import { Plugin, PluginKey } from "@milkdown/prose/state";
import { Decoration, DecorationSet } from "@milkdown/prose/view";
import type { Node as PMNode } from "@milkdown/prose/model";

// Greedy-up-to-]; supports any content except `]` to keep parsing trivial.
// Nested brackets would need a real parser — out of scope for v1.
const SIDENOTE_RE = /\^\[([^\]\n]+)\]/g;

function findSidenoteDecos(doc: PMNode): DecorationSet {
  const decos: Decoration[] = [];
  doc.descendants((node, pos, parent) => {
    if (!node.isText || !node.text) return;
    // Skip code spans
    if (node.marks.some((m) => m.type.name === "code")) return;
    const ptype = parent?.type.name || "";
    if (ptype === "code_block" || ptype === "fence" || ptype.includes("code")) return;

    const text = node.text;
    SIDENOTE_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = SIDENOTE_RE.exec(text)) !== null) {
      const inner = m[1];
      if (!inner) continue;
      const start = pos + m.index;             // position of `^`
      const openerEnd = start + 2;             // after `^[`
      const closerStart = openerEnd + inner.length;
      const closerEnd = closerStart + 1;       // after `]`

      // Hide `^[`
      decos.push(
        Decoration.inline(start, openerEnd, { class: "mf-sidenote-bracket" }),
      );
      // Style inner content
      decos.push(
        Decoration.inline(openerEnd, closerStart, { class: "mf-sidenote" }),
      );
      // Hide `]`
      decos.push(
        Decoration.inline(closerStart, closerEnd, { class: "mf-sidenote-bracket" }),
      );
    }
  });
  return DecorationSet.create(doc, decos);
}

const sidenoteKey = new PluginKey("mf-sidenote");

function transactionTouchesSidenotes(
  tr: import("@milkdown/prose/state").Transaction,
): boolean {
  for (const step of tr.steps as any[]) {
    const slice = step.slice;
    if (!slice) continue;
    let found = false;
    slice.content.descendants((node: any) => {
      if (found) return false;
      if (node.isText && /[\^\[\]]/.test(node.text || "")) {
        found = true;
        return false;
      }
      return true;
    });
    if (found) return true;
  }
  return false;
}

export const sidenotePlugin = $prose(
  () =>
    new Plugin({
      key: sidenoteKey,
      state: {
        init: (_config, { doc }) => findSidenoteDecos(doc),
        apply: (tr, old) => {
          if (!tr.docChanged) return old;
          if (transactionTouchesSidenotes(tr)) return findSidenoteDecos(tr.doc);
          return old.map(tr.mapping, tr.doc);
        },
      },
      props: {
        decorations(state) {
          return sidenoteKey.getState(state);
        },
      },
    }),
);
