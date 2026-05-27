/**
 * In-document find bar (Cmd+F).
 *
 * Searches the rendered text of the *active* editor (Crepe markdown editor
 * or the CodeMirror code editor) and highlights matches using the CSS
 * Custom Highlight API — which works on contenteditable + any DOM text
 * without mutating the document (no <mark> injection that would corrupt
 * ProseMirror's model).
 *
 * Navigation: Enter = next, Shift+Enter = prev, Esc = close.
 *
 * Fallback: if CSS.highlights isn't available (older WebKit), we still
 * scroll to matches but without the highlight tint.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { X, ArrowUp, ArrowDown } from "lucide-react";
import { useStore } from "../store";

const HL_SUPPORTED = typeof CSS !== "undefined" && "highlights" in CSS;

function getEditorContainer(): HTMLElement | null {
  // Prefer markdown editor; fall back to code editor
  return (
    document.querySelector<HTMLElement>(".app-panel .milkdown .ProseMirror") ||
    document.querySelector<HTMLElement>(".app-panel .cm-content") ||
    null
  );
}

function collectMatches(container: HTMLElement, query: string): Range[] {
  const ranges: Range[] = [];
  if (!query) return ranges;
  const needle = query.toLowerCase();
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) =>
      (n.textContent ?? "").trim().length > 0
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_REJECT,
  });
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const text = (node.textContent ?? "").toLowerCase();
    let from = text.indexOf(needle);
    while (from !== -1) {
      const range = document.createRange();
      try {
        range.setStart(node, from);
        range.setEnd(node, from + query.length);
        ranges.push(range);
      } catch {
        /* skip invalid range */
      }
      from = text.indexOf(needle, from + Math.max(1, query.length));
    }
  }
  return ranges;
}

export function FindBar() {
  const findOpen = useStore((s) => s.findOpen);
  const setFindOpen = useStore((s) => s.setFindOpen);
  const activePath = useStore((s) => s.activePath);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [count, setCount] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const rangesRef = useRef<Range[]>([]);

  // Re-run search whenever query / open / active doc changes
  const search = useMemo(
    () => () => {
      const container = getEditorContainer();
      if (!container || !query) {
        rangesRef.current = [];
        setCount(0);
        if (HL_SUPPORTED) {
          CSS.highlights.delete("mf-find");
          CSS.highlights.delete("mf-find-active");
        }
        return;
      }
      const ranges = collectMatches(container, query);
      rangesRef.current = ranges;
      setCount(ranges.length);
      setActive((prev) => (ranges.length === 0 ? 0 : Math.min(prev, ranges.length - 1)));
      paint(ranges.length === 0 ? 0 : Math.min(active, ranges.length - 1));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [query, activePath],
  );

  const paint = (idx: number) => {
    if (!HL_SUPPORTED) return;
    const ranges = rangesRef.current;
    if (!ranges.length) {
      CSS.highlights.delete("mf-find");
      CSS.highlights.delete("mf-find-active");
      return;
    }
    const all = new Highlight(...ranges.filter((_, i) => i !== idx));
    const cur = new Highlight(ranges[idx]);
    CSS.highlights.set("mf-find", all);
    CSS.highlights.set("mf-find-active", cur);
    // Scroll active match into view
    const r = ranges[idx];
    const el = r.startContainer.parentElement;
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
  };

  // Focus input + re-search on open
  useEffect(() => {
    if (findOpen) {
      inputRef.current?.focus();
      inputRef.current?.select();
      search();
    } else {
      // Clear highlights when closed
      if (HL_SUPPORTED) {
        CSS.highlights.delete("mf-find");
        CSS.highlights.delete("mf-find-active");
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [findOpen]);

  // Re-run on query change
  useEffect(() => {
    if (findOpen) search();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, activePath]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (HL_SUPPORTED) {
        CSS.highlights.delete("mf-find");
        CSS.highlights.delete("mf-find-active");
      }
    };
  }, []);

  if (!findOpen) return null;

  const go = (dir: 1 | -1) => {
    const n = rangesRef.current.length;
    if (!n) return;
    const next = (active + dir + n) % n;
    setActive(next);
    paint(next);
  };

  return (
    <div
      className="absolute top-3 right-5 z-[70] flex items-center gap-1.5 px-2 py-1.5 rounded-xl bg-[var(--color-bg-soft)]"
      style={{
        boxShadow: `
          inset 0 0 0 1px var(--glass-border),
          0 8px 24px rgba(0,0,0,0.35),
          0 16px 40px rgba(0,0,0,0.25)
        `,
      }}
    >
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            go(e.shiftKey ? -1 : 1);
          } else if (e.key === "Escape") {
            e.preventDefault();
            setFindOpen(false);
          }
        }}
        placeholder="文档内查找"
        className="bg-transparent outline-none text-[12.5px] w-[160px] placeholder:text-[var(--color-text-subtle)]"
      />
      <span className="text-[11px] text-[var(--color-text-subtle)] tabular-nums min-w-[44px] text-right">
        {count > 0 ? `${active + 1} / ${count}` : query ? "无结果" : ""}
      </span>
      <button
        onClick={() => go(-1)}
        disabled={count === 0}
        className="p-1 rounded-md text-[var(--color-text-muted)] hover:bg-[color-mix(in_oklab,var(--color-text)_8%,transparent)] disabled:opacity-30"
        title="上一个 (⇧Enter)"
      >
        <ArrowUp size={12} strokeWidth={2} />
      </button>
      <button
        onClick={() => go(1)}
        disabled={count === 0}
        className="p-1 rounded-md text-[var(--color-text-muted)] hover:bg-[color-mix(in_oklab,var(--color-text)_8%,transparent)] disabled:opacity-30"
        title="下一个 (Enter)"
      >
        <ArrowDown size={12} strokeWidth={2} />
      </button>
      <button
        onClick={() => setFindOpen(false)}
        className="p-1 rounded-md text-[var(--color-text-muted)] hover:bg-[color-mix(in_oklab,var(--color-text)_8%,transparent)]"
        title="关闭 (Esc)"
      >
        <X size={12} strokeWidth={2} />
      </button>
    </div>
  );
}
