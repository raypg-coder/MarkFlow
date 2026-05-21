/**
 * Milkdown plugin: detect `/image <prompt>` typed in a single block,
 * intercept Enter, remove the prompt line, and emit a `markflow:gen-image`
 * event that the app handles.
 */

import { $prose } from "@milkdown/utils";
import { keymap } from "@milkdown/prose/keymap";

const TRIGGER_RE = /^\s*\/image\s+(.+?)\s*$/;

export const imageGenPlugin = $prose(() =>
  keymap({
    Enter: (state, dispatch) => {
      const { selection } = state;
      const { $from } = selection;
      if (!$from.parent.isTextblock) return false;
      const lineText = $from.parent.textContent;
      const m = TRIGGER_RE.exec(lineText);
      if (!m) return false;
      const prompt = m[1].trim();
      if (!prompt) return false;

      // Remove the trigger line content
      const blockStart = $from.start();
      const blockEnd = $from.end();
      if (dispatch) {
        const tr = state.tr.delete(blockStart, blockEnd);
        dispatch(tr);
      }
      // Fire the gen-image event
      window.dispatchEvent(
        new CustomEvent("markflow:gen-image", { detail: { prompt } }),
      );
      return true;
    },
  }),
);
