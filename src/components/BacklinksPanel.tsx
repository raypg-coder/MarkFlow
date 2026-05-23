import { useEffect } from "react";
import { Link2, RefreshCw } from "lucide-react";
import { useStore, basename } from "../store";

export function BacklinksPanel() {
  const {
    activePath,
    backlinks,
    backlinksLoading,
    backlinksTarget,
    loadBacklinks,
    openFile,
  } = useStore();

  useEffect(() => {
    if (activePath && activePath !== backlinksTarget) {
      loadBacklinks(activePath);
    }
  }, [activePath, backlinksTarget, loadBacklinks]);

  // Group by source file
  const grouped = backlinks.reduce<Record<string, typeof backlinks>>((acc, b) => {
    (acc[b.source] ||= []).push(b);
    return acc;
  }, {});
  const sourceFiles = Object.keys(grouped).sort();

  return (
    <div className="h-full flex flex-col">
      <div className="px-4 pt-4 pb-2 flex items-center justify-between">
        <span className="geek-label">backlinks</span>
        <button
          onClick={() => activePath && loadBacklinks(activePath)}
          disabled={!activePath || backlinksLoading}
          title="刷新"
          className="p-1 rounded hover:bg-[var(--color-bg)] text-[var(--color-text-subtle)] hover:text-[var(--color-text-muted)] disabled:opacity-40"
        >
          <RefreshCw size={11} strokeWidth={1.75} className={backlinksLoading ? "animate-spin" : ""} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto pb-2">
        {!activePath && (
          <div className="px-3 py-2 text-[12px] text-[var(--color-text-subtle)]">
            未打开任何文件
          </div>
        )}
        {activePath && backlinksLoading && backlinks.length === 0 && (
          <div className="px-3 py-2 text-[12px] text-[var(--color-text-subtle)]">扫描中…</div>
        )}
        {activePath && !backlinksLoading && backlinks.length === 0 && (
          <div className="px-3 py-2 text-[12px] text-[var(--color-text-subtle)]">
            暂无反链
          </div>
        )}
        {sourceFiles.map((source) => (
          <div key={source} className="mb-2">
            <button
              onClick={() => openFile(source, basename(source))}
              className="w-full flex items-center gap-1.5 px-3 py-1 text-left hover:bg-[color-mix(in_oklab,var(--color-text)_6%,transparent)] rounded-md mx-1"
              title={source}
            >
              <Link2 size={11} className="text-[var(--color-accent)] shrink-0" strokeWidth={2} />
              <span className="text-[12.5px] text-[var(--color-text)] truncate flex-1">
                {basename(source)}
              </span>
              <span className="text-[10px] text-[var(--color-text-subtle)] font-mono">
                {grouped[source].length}
              </span>
            </button>
            {grouped[source].map((b, i) => (
              <button
                key={i}
                onClick={() => openFile(source, basename(source))}
                className="block w-full text-left px-3 py-1 mx-1 rounded-sm hover:bg-[var(--color-bg)] group"
                style={{ paddingLeft: 28 }}
              >
                <div className="flex items-center gap-2 text-[10.5px] text-[var(--color-text-subtle)] font-mono mb-0.5">
                  <span>L{b.line}</span>
                  <span
                    className={
                      b.kind === "wiki"
                        ? "text-[var(--md-violet)] uppercase tracking-wider"
                        : "text-[var(--color-text-muted)] uppercase tracking-wider"
                    }
                  >
                    {b.kind === "wiki" ? "wiki" : "md"}
                  </span>
                </div>
                <div className="text-[12px] text-[var(--color-text-muted)] line-clamp-2 leading-relaxed">
                  {b.preview}
                </div>
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
