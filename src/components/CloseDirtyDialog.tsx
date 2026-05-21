import { useEffect, useRef } from "react";
import { useStore } from "../store";

/**
 * Dirty-close confirmation modal.
 *
 * Triggered when the user closes (TabBar X / ⌘W) a tab whose content has
 * unsaved changes. Three actions:
 *   [ save ]     — saveFile → closeFile  (default; Enter)
 *   [ discard ]  — closeFile (drops swap)  (D)
 *   [ cancel ]   — dismiss, keep tab open  (Esc; default close)
 *
 * Replaces the previous native window.confirm() — cleaner UX, keyboard-first,
 * and consistent with the rest of the app's cyberpunk aesthetic.
 */
export function CloseDirtyDialog() {
  const { closeDirtyPath, openFiles, setCloseDirtyPath, saveFile, closeFile } = useStore();
  const dialogRef = useRef<HTMLDivElement>(null);

  const file = openFiles.find((f) => f.path === closeDirtyPath);

  // Auto-focus the dialog on open for immediate keyboard interaction
  useEffect(() => {
    if (closeDirtyPath && dialogRef.current) {
      dialogRef.current.focus();
    }
  }, [closeDirtyPath]);

  useEffect(() => {
    if (!closeDirtyPath || !file) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setCloseDirtyPath(null);
      } else if (e.key === "Enter") {
        e.preventDefault();
        void onSave();
      } else if (e.key.toLowerCase() === "d") {
        // Single-key discard (no modifier) — fast keyboard flow
        if (!e.metaKey && !e.ctrlKey && !e.altKey) {
          e.preventDefault();
          onDiscard();
        }
      }
    };

    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closeDirtyPath, file]);

  if (!closeDirtyPath || !file) return null;

  const onSave = async () => {
    window.dispatchEvent(new Event("markflow:flush-editor"));
    try {
      await saveFile(file.path);
      closeFile(file.path);
    } finally {
      setCloseDirtyPath(null);
    }
  };

  const onDiscard = () => {
    closeFile(file.path);             // also deletes the swap
    setCloseDirtyPath(null);
  };

  const onCancel = () => setCloseDirtyPath(null);

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/55 backdrop-blur-[8px]"
      onClick={onCancel}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="w-[420px] max-w-[92vw] bg-[var(--color-bg)] text-[var(--color-text)] rounded-sm outline-none"
        style={{
          boxShadow: `
            inset 0 0 0 1px color-mix(in oklab, var(--color-accent) 40%, transparent),
            0 0 32px -8px color-mix(in oklab, var(--color-accent) 30%, transparent),
            0 24px 48px rgba(0,0,0,0.6)
          `,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 pt-4 pb-3 border-b border-[var(--color-border)]">
          <div className="flex items-baseline gap-2 mb-1">
            <span className="geek-label" style={{ fontSize: "10px" }}>unsaved</span>
            <span className="font-mono text-[11px] text-[var(--color-text-subtle)] tabular-nums">
              {(file.content.length - file.savedContent.length > 0 ? "+" : "")}
              {file.content.length - file.savedContent.length} B
            </span>
          </div>
          <div
            className="font-mono text-[14px] font-semibold truncate"
            title={file.path}
          >
            {file.name}
          </div>
          <div className="text-[11.5px] text-[var(--color-text-muted)] mt-1">
            存在未保存的修改，关闭前如何处理？
          </div>
        </div>

        <div className="flex items-center gap-2 px-5 py-3.5">
          <button
            onClick={onSave}
            className="flex-1 px-3 py-1.5 text-[12.5px] rounded-sm font-medium bg-[var(--color-accent)] text-black hover:opacity-90 font-mono"
            autoFocus
          >
            [ save ]
            <span className="ml-1.5 opacity-60 text-[10px]">↵</span>
          </button>
          <button
            onClick={onDiscard}
            className="px-3 py-1.5 text-[12.5px] rounded-sm font-mono text-[var(--color-danger)] border border-[var(--color-danger)]/40 hover:border-[var(--color-danger)] hover:bg-[color-mix(in_oklab,var(--color-danger)_8%,transparent)]"
          >
            [ discard ]
            <span className="ml-1.5 opacity-60 text-[10px]">d</span>
          </button>
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-[12.5px] rounded-sm font-mono text-[var(--color-text-muted)] hover:bg-[var(--color-bg-soft)] hover:text-[var(--color-text)]"
          >
            [ cancel ]
            <span className="ml-1.5 opacity-60 text-[10px]">esc</span>
          </button>
        </div>
      </div>
    </div>
  );
}
