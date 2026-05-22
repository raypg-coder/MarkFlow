import { useEffect, useRef, useState } from "react";
import { Sparkles, Languages, MessageSquare, Scissors } from "lucide-react";

type Action = "explain" | "summarize" | "rewrite" | "translate";

interface Pos {
  x: number;
  y: number;
}

/**
 * Floating menu shown above the user's text selection inside the markdown editor.
 * Buttons dispatch `markflow:ai-action` with the selected text; App.tsx routes it
 * to the AI panel.
 */
export function SelectionMenu({ containerRef }: { containerRef: React.RefObject<HTMLElement | null> }) {
  const [pos, setPos] = useState<Pos | null>(null);
  const [selectedText, setSelectedText] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handle = () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
        setPos(null);
        return;
      }
      const range = sel.getRangeAt(0);
      const editor = containerRef.current;
      if (!editor) return;
      // Confirm the selection is inside the editor
      const anchorNode = range.commonAncestorContainer;
      if (!editor.contains(anchorNode)) {
        setPos(null);
        return;
      }
      const text = sel.toString().trim();
      if (text.length < 2) {
        setPos(null);
        return;
      }
      const rect = range.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) return;
      setSelectedText(text);
      setPos({
        x: rect.left + rect.width / 2,
        y: rect.top - 6,
      });
    };

    // Run on selection change; also on scroll to follow text
    const onSelChange = () => {
      // Don't hide if focus is in our menu (button click)
      if (menuRef.current && menuRef.current.contains(document.activeElement)) return;
      handle();
    };
    const onScroll = () => {
      if (!pos) return;
      handle();
    };

    document.addEventListener("selectionchange", onSelChange);
    document.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("selectionchange", onSelChange);
      document.removeEventListener("scroll", onScroll, true);
    };
  }, [containerRef, pos]);

  const trigger = (action: Action) => {
    if (!selectedText) return;
    window.dispatchEvent(
      new CustomEvent("markflow:ai-action", {
        detail: { action, text: selectedText },
      }),
    );
    setPos(null);
  };

  if (!pos) return null;

  // Clamp to viewport
  const x = Math.max(80, Math.min(window.innerWidth - 80, pos.x));
  const y = Math.max(50, pos.y);

  return (
    <div
      ref={menuRef}
      className="fixed z-[80] -translate-x-1/2 -translate-y-full"
      style={{ left: x, top: y }}
      onMouseDown={(e) => e.preventDefault() /* keep selection */}
    >
      <div className="flex items-stretch bg-[var(--color-bg-soft)] border border-[var(--color-border)] rounded-xl shadow-2xl shadow-black/30 overflow-hidden text-[var(--color-text-muted)]">
        <button
          onClick={() => trigger("explain")}
          title="解释"
          className="flex items-center gap-1 px-2 py-1.5 text-[11.5px] hover:bg-[var(--color-bg-soft)] hover:text-[var(--color-text)]"
        >
          <MessageSquare size={11} strokeWidth={1.75} />
          解释
        </button>
        <div className="w-px bg-[var(--color-border)]" />
        <button
          onClick={() => trigger("summarize")}
          title="总结"
          className="flex items-center gap-1 px-2 py-1.5 text-[11.5px] hover:bg-[var(--color-bg-soft)] hover:text-[var(--color-text)]"
        >
          <Scissors size={11} strokeWidth={1.75} />
          总结
        </button>
        <div className="w-px bg-[var(--color-border)]" />
        <button
          onClick={() => trigger("rewrite")}
          title="改写"
          className="flex items-center gap-1 px-2 py-1.5 text-[11.5px] hover:bg-[var(--color-bg-soft)] hover:text-[var(--color-text)]"
        >
          <Sparkles size={11} strokeWidth={1.75} />
          改写
        </button>
        <div className="w-px bg-[var(--color-border)]" />
        <button
          onClick={() => trigger("translate")}
          title="翻译"
          className="flex items-center gap-1 px-2 py-1.5 text-[11.5px] hover:bg-[var(--color-bg-soft)] hover:text-[var(--color-text)]"
        >
          <Languages size={11} strokeWidth={1.75} />
          翻译
        </button>
      </div>
      {/* small arrow */}
      <div
        className="absolute left-1/2 top-full -translate-x-1/2 w-2 h-2 bg-[var(--color-bg-soft)] border-r border-b border-[var(--color-border)]"
        style={{ transform: "translateX(-50%) rotate(45deg)", marginTop: "-4px" }}
      />
    </div>
  );
}
