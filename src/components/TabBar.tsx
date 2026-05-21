import { X } from "lucide-react";
import clsx from "clsx";
import { useStore } from "../store";

export function TabBar() {
  const { openFiles, activePath, setActive, closeFile } = useStore();

  if (!openFiles.length) {
    return <div data-tauri-drag-region className="flex-1 self-stretch" />;
  }

  return (
    <div data-tauri-drag-region className="flex items-end overflow-x-auto flex-1 min-w-0">
      {openFiles.map((f, i) => {
        const dirty = f.content !== f.savedContent;
        const active = f.path === activePath;
        const num = String(i + 1).padStart(2, "0");
        return (
          <div
            key={f.path}
            onClick={() => setActive(f.path)}
            className={clsx(
              "tab-item group flex items-center gap-1.5 pl-2.5 pr-1.5 h-[34px] mx-px text-[12px] cursor-pointer whitespace-nowrap min-w-0 transition-colors",
              active ? "tab-active" : "",
            )}
          >
            <span
              className={clsx(
                "font-mono text-[10px] tracking-tight tabular-nums",
                active ? "text-[var(--color-text-subtle)]" : "text-[var(--chrome-text-subtle)]",
              )}
            >
              {num}
            </span>
            <span className="truncate max-w-[200px]">{f.name}</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (dirty && !confirm(`${f.name} 有未保存修改，确定关闭？`)) return;
                closeFile(f.path);
              }}
              className={clsx(
                "rounded w-4 h-4 flex items-center justify-center shrink-0 transition-opacity",
                dirty
                  ? "text-[var(--color-accent)]"
                  : active
                  ? "opacity-0 group-hover:opacity-100 hover:bg-[var(--color-bg-muted)] text-[var(--color-text-muted)]"
                  : "opacity-0 group-hover:opacity-100 hover:bg-[var(--chrome-bg-muted)] text-[var(--chrome-text-muted)]",
              )}
              title={dirty ? "未保存 — 点击关闭" : "关闭"}
            >
              {dirty ? (
                <span className="w-1.5 h-1.5 block rounded-full bg-current" />
              ) : (
                <X size={11} />
              )}
            </button>
          </div>
        );
      })}
      <div data-tauri-drag-region className="flex-1 min-w-0 self-stretch" />
    </div>
  );
}
