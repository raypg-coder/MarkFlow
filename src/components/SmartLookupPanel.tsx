import { useCallback, useEffect, useState } from "react";
import { Search, RefreshCw, Trash2, Hammer, Settings as SettingsIcon } from "lucide-react";
import { useStore, basename } from "../store";

export function SmartLookupPanel() {
  const {
    llmSettings,
    vectorIndex,
    indexProgress,
    semanticQuery,
    semanticResults,
    semanticSearching,
    setSemanticQuery,
    runSemanticSearch,
    rebuildVectorIndex,
    previewIndexDiff,
    clearVectorIndex,
    openFile,
    setSettingsOpen,
    activePath,
    openFiles,
    roots,
  } = useStore();

  const [autoQuery, setAutoQuery] = useState(false);
  const [rebuildError, setRebuildError] = useState<string | null>(null);
  const [diff, setDiff] = useState<{ toReindex: number; removed: number; kept: number; total: number } | null>(null);

  const refreshDiff = useCallback(async () => {
    if (!llmSettings.embedModel || roots.length === 0) {
      setDiff(null);
      return;
    }
    try {
      const d = await previewIndexDiff();
      setDiff(d);
    } catch {
      setDiff(null);
    }
  }, [llmSettings.embedModel, roots.length, previewIndexDiff]);

  useEffect(() => {
    if (!indexProgress) refreshDiff();
  }, [indexProgress, vectorIndex.length, refreshDiff]);

  // Auto-query: use the active file's first 800 chars as the query and re-search
  useEffect(() => {
    if (!autoQuery || !activePath) return;
    const file = openFiles.find((f) => f.path === activePath);
    if (!file || file.kind !== "markdown") return;
    const seed = file.content.slice(0, 800).trim();
    if (!seed) return;
    setSemanticQuery(seed);
    const t = setTimeout(() => {
      runSemanticSearch(true);
    }, 300);
    return () => clearTimeout(t);
  }, [autoQuery, activePath, openFiles, setSemanticQuery, runSemanticSearch]);

  const notConfigured = !llmSettings.embedModel;
  const totalFiles = new Set(vectorIndex.map((c) => c.path)).size;

  const handleRebuild = async (mode: "incremental" | "full") => {
    setRebuildError(null);
    try {
      await rebuildVectorIndex(mode);
      await refreshDiff();
    } catch (e: any) {
      setRebuildError(String(e?.message ?? e));
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-4 pt-4 pb-2 flex items-center justify-between">
        <span className="geek-label">semantic</span>
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => handleRebuild("incremental")}
            disabled={!!indexProgress || notConfigured}
            title={
              diff && diff.toReindex + diff.removed === 0
                ? "索引已是最新"
                : `增量更新 (${diff?.toReindex ?? 0} 改动 / ${diff?.removed ?? 0} 删除)`
            }
            className="p-1 rounded hover:bg-[var(--color-bg)] text-[var(--color-text-subtle)] hover:text-[var(--color-text-muted)] disabled:opacity-40"
          >
            <RefreshCw
              size={11}
              strokeWidth={1.75}
              className={indexProgress ? "animate-spin" : ""}
            />
          </button>
          <button
            onClick={() => {
              if (vectorIndex.length === 0 || confirm("全量重建会重新嵌入所有文件，可能较慢。继续？")) {
                handleRebuild("full");
              }
            }}
            disabled={!!indexProgress || notConfigured}
            title="全量重建"
            className="p-1 rounded hover:bg-[var(--color-bg)] text-[var(--color-text-subtle)] hover:text-[var(--color-text-muted)] disabled:opacity-40"
          >
            <Hammer size={11} strokeWidth={1.75} />
          </button>
          {vectorIndex.length > 0 && !indexProgress && (
            <button
              onClick={() => {
                if (confirm("清空向量索引？")) clearVectorIndex();
              }}
              title="清空索引"
              className="p-1 rounded hover:bg-[var(--color-bg)] text-[var(--color-text-subtle)] hover:text-[var(--color-danger)]"
            >
              <Trash2 size={11} strokeWidth={1.75} />
            </button>
          )}
        </div>
      </div>

      {/* Configuration check */}
      {notConfigured && (
        <div className="mx-3 my-2 p-2.5 rounded-md bg-[var(--md-amber-soft)] text-[12px] leading-relaxed">
          <div className="font-medium mb-1">尚未配置嵌入模型</div>
          <button
            onClick={() => setSettingsOpen(true)}
            className="inline-flex items-center gap-1 text-[var(--color-accent)] hover:underline text-[11.5px]"
          >
            <SettingsIcon size={10} strokeWidth={1.75} />
            打开设置
          </button>
        </div>
      )}

      {/* Search input */}
      {!notConfigured && (
        <div className="px-3 pb-2">
          <div className="flex items-center gap-2 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-md px-2.5 py-1.5 focus-within:border-[var(--color-accent)]">
            <Search size={12} className="text-[var(--color-text-subtle)] shrink-0" />
            <input
              value={semanticQuery}
              onChange={(e) => setSemanticQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") runSemanticSearch();
              }}
              placeholder="描述要找的内容…"
              disabled={vectorIndex.length === 0}
              className="bg-transparent flex-1 outline-none text-[12.5px] placeholder:text-[var(--color-text-subtle)] disabled:opacity-50"
            />
          </div>
          <label className="flex items-center gap-1.5 mt-1.5 text-[10.5px] text-[var(--color-text-muted)] cursor-pointer select-none">
            <input
              type="checkbox"
              checked={autoQuery}
              onChange={(e) => setAutoQuery(e.target.checked)}
              className="w-3 h-3 accent-[var(--color-accent)]"
            />
            自动用当前文件查询（找相似笔记）
          </label>
        </div>
      )}

      {/* Progress / index status */}
      {indexProgress && (
        <div className="px-3 pb-2">
          <div className="text-[10.5px] text-[var(--color-text-muted)] mb-1 flex justify-between font-mono">
            <span>
              {indexProgress.phase === "scanning" && "扫描文件"}
              {indexProgress.phase === "embedding" && "嵌入计算"}
              {indexProgress.phase === "saving" && "保存中"}
              {indexProgress.phase === "done" && "完成"}
              {indexProgress.fileChanged !== undefined &&
                indexProgress.fileTotal !== undefined &&
                ` · ${indexProgress.fileChanged}/${indexProgress.fileTotal} 文件`}
            </span>
            <span>
              {indexProgress.done} / {indexProgress.total}
            </span>
          </div>
          <div className="h-1 bg-[var(--color-bg)] rounded overflow-hidden">
            <div
              className="h-full bg-[var(--color-accent)] transition-all duration-200"
              style={{
                width: `${
                  indexProgress.total > 0
                    ? (indexProgress.done / indexProgress.total) * 100
                    : 0
                }%`,
              }}
            />
          </div>
        </div>
      )}

      {rebuildError && (
        <div className="mx-3 mb-2 p-2 rounded-md bg-[var(--md-rose-soft)] text-[11px] text-[var(--md-rose)] font-mono">
          {rebuildError}
        </div>
      )}

      {/* Index stats + diff */}
      {!notConfigured && !indexProgress && (
        <div className="px-3 pb-2 text-[10.5px] text-[var(--color-text-subtle)] font-mono space-y-0.5">
          {vectorIndex.length > 0 ? (
            <div>
              {vectorIndex.length} 块 · {totalFiles} 文件
            </div>
          ) : (
            <div>索引为空，点击 ↻ 构建</div>
          )}
          {diff && (diff.toReindex > 0 || diff.removed > 0) && (
            <div className="text-[var(--color-accent)]">
              {diff.toReindex > 0 && <>+{diff.toReindex} 待嵌入  </>}
              {diff.removed > 0 && <>−{diff.removed} 已删除</>}
            </div>
          )}
          {diff && diff.toReindex === 0 && diff.removed === 0 && vectorIndex.length > 0 && (
            <div className="text-[var(--md-teal)]">索引最新</div>
          )}
        </div>
      )}

      {/* Results */}
      <div className="flex-1 overflow-y-auto pb-2">
        {semanticSearching && (
          <div className="px-3 py-2 text-[12px] text-[var(--color-text-muted)]">检索中…</div>
        )}
        {!semanticSearching &&
          semanticResults.length === 0 &&
          semanticQuery &&
          vectorIndex.length > 0 && (
            <div className="px-3 py-2 text-[12px] text-[var(--color-text-subtle)]">无匹配结果</div>
          )}
        {semanticResults.map((hit, i) => (
          <button
            key={`${hit.chunk.path}-${hit.chunk.chunkIdx}-${i}`}
            onClick={() => openFile(hit.chunk.path, basename(hit.chunk.path))}
            className="block w-full text-left px-3 py-2 mx-1 rounded-md hover:bg-[color-mix(in_oklab,var(--color-text)_6%,transparent)] group"
          >
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-[10px] font-mono text-[var(--color-accent)] shrink-0">
                {hit.score.toFixed(2)}
              </span>
              <span className="text-[12.5px] text-[var(--color-text)] truncate">
                {basename(hit.chunk.path)}
              </span>
            </div>
            <div className="text-[11.5px] text-[var(--color-text-muted)] line-clamp-2 leading-relaxed">
              {hit.chunk.snippet}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
