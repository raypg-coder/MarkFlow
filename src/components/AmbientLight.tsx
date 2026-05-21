import { useEffect, useRef } from "react";

/**
 * Soft pink/cyan radial halo that follows the text caret inside a container.
 * Position is updated on selectionchange + scroll events.
 *
 * The halo itself is a `position: fixed` div with mix-blend-mode: screen —
 * so it adds light without occluding text. Listens via DOM-level events to
 * stay decoupled from Milkdown internals.
 */
export function AmbientLight({
  containerRef,
}: {
  containerRef: React.RefObject<HTMLElement | null>;
}) {
  const lightRef = useRef<HTMLDivElement>(null);
  const lastPos = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const light = lightRef.current;
    const container = containerRef.current;
    if (!light || !container) return;

    const reposition = () => {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) {
        light.classList.remove("visible");
        return;
      }
      const range = sel.getRangeAt(0);
      const node = range.commonAncestorContainer;
      if (!container.contains(node)) {
        light.classList.remove("visible");
        return;
      }
      // For collapsed cursors, getBoundingClientRect may return zero-size rect;
      // ranges still report a valid x via the start position
      const rect = range.getBoundingClientRect();
      const x = rect.left + (rect.width || 0) / 2;
      const y = rect.top + (rect.height || 16) / 2;
      // Skip if cursor is at (0,0) — sometimes happens before first focus
      if (x === 0 && y === 0) return;
      lastPos.current = { x, y };
      light.style.left = x + "px";
      light.style.top = y + "px";
      light.classList.add("visible");
    };

    const onSel = () => reposition();
    const onScroll = () => reposition();
    const onBlur = () => light.classList.remove("visible");

    document.addEventListener("selectionchange", onSel);
    // Listen on document for scroll on any scrollable ancestor (capture phase)
    document.addEventListener("scroll", onScroll, true);
    window.addEventListener("blur", onBlur);

    // Try once on mount
    reposition();

    return () => {
      document.removeEventListener("selectionchange", onSel);
      document.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("blur", onBlur);
    };
  }, [containerRef]);

  return <div ref={lightRef} className="ambient-light" aria-hidden="true" />;
}
