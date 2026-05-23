/**
 * Milkdown ProseMirror plugin: inline decorations for #hashtags.
 *
 *  - Doesn't modify the schema — markdown serializes back as plain text.
 *  - Adds `class="mf-tag" data-tag="<name>"` to the matched range.
 *  - Skipped inside code spans / code blocks (Crepe handles those via
 *    different node types; the decoration walker only visits text nodes
 *    in the main flow, so code text nodes are matched too — we filter
 *    by parent node type to skip them).
 *
 * Tag grammar:
 *   #word[-_/word]*  — letters, digits, dash, underscore, slash for nesting
 *   Must start at line-start, whitespace, or punctuation (avoid matching
 *   inside URLs like example.com/#anchor).
 */
import { $prose } from "@milkdown/utils";
import { Plugin, PluginKey } from "@milkdown/prose/state";
import { Decoration, DecorationSet } from "@milkdown/prose/view";
import type { Node as PMNode } from "@milkdown/prose/model";

// Match #tag where # is preceded by start-of-string, whitespace, or
// punctuation that's not part of an identifier. Body can include letters,
// digits, dash, underscore, slash, and Chinese characters.
const TAG_RE = /(^|[\s\p{P}])#([A-Za-z0-9_\-\/一-鿿][\w\-\/一-鿿]*)/gu;

function findTagDecos(doc: PMNode): DecorationSet {
  const decos: Decoration[] = [];
  doc.descendants((node, pos, parent) => {
    if (!node.isText || !node.text) return;
    // Skip code spans (inline) — Crepe marks them with `code` mark
    if (node.marks.some((m) => m.type.name === "code")) return;
    // Skip code blocks — their parent type contains "code"
    const ptype = parent?.type.name || "";
    if (ptype === "code_block" || ptype === "fence" || ptype.includes("code")) return;

    const text = node.text;
    TAG_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = TAG_RE.exec(text)) !== null) {
      const lead = m[1] ?? "";
      const tag = m[2];
      if (!tag) continue;
      // Position of '#' = match start + length of leading char(s)
      const hashStart = pos + m.index + lead.length;
      const tagEnd = hashStart + 1 + tag.length;
      decos.push(
        Decoration.inline(hashStart, tagEnd, {
          class: "mf-tag",
          "data-tag": tag,
        }),
      );
    }
  });
  return DecorationSet.create(doc, decos);
}

const tagKey = new PluginKey("mf-tag");

/** Cheap check — only run a full re-scan when the transaction inserts/removes
 *  characters that could affect tags (#, word chars, whitespace). */
function transactionTouchesTags(
  tr: import("@milkdown/prose/state").Transaction,
): boolean {
  for (const step of tr.steps as any[]) {
    const slice = step.slice;
    if (!slice) continue;
    let found = false;
    slice.content.descendants((node: any) => {
      if (found) return false;
      if (node.isText && /[#\s]/.test(node.text || "")) {
        found = true;
        return false;
      }
      return true;
    });
    if (found) return true;
  }
  return false;
}

export const tagPlugin = $prose(
  () =>
    new Plugin({
      key: tagKey,
      state: {
        init: (_config, { doc }) => findTagDecos(doc),
        apply: (tr, old) => {
          if (!tr.docChanged) return old;
          if (transactionTouchesTags(tr)) return findTagDecos(tr.doc);
          return old.map(tr.mapping, tr.doc);
        },
      },
      props: {
        decorations(state) {
          return tagKey.getState(state);
        },
      },
    }),
);
