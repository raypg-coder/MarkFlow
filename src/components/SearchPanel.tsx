import { Search } from "lucide-react";
import { useStore } from "../store";
import { basename } from "../store";

export function SearchPanel() {
  const {
    searchQuery,
    setSearchQuery,
    runSearch,
    searchHits,
    searching,
    openFile,
  } = useStore();

  return (
    <div className="h-full flex flex-col">
      <div className="px-3 pt-3 pb-2">
        <span className="geek-label">search</span>
      </div>
      <div className="px-3 pb-3">
        <div className="cyber-input flex items-center gap-2 px-2.5 py-1.5">
          <Search size={12} className="text-[var(--color-accent)]" />
          <input
            autoFocus
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") runSearch();
            }}
            placeholder="> search content"
            className="bg-transparent flex-1 outline-none text-[13px] placeholder:text-[var(--color-text-subtle)] font-mono"
          />
        </div>
        {searchQuery && (
          <div className="waveform mt-1.5 mx-0.5">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="waveform-bar" />
            ))}
          </div>
        )}
      </div>
      <div className="flex-1 overflow-y-auto">
        {searching && (
          <div className="px-3 py-2 text-[12px] text-[var(--color-text-muted)]">搜索中…</div>
        )}
        {!searching && searchHits.length === 0 && searchQuery && (
          <div className="px-3 py-2 text-[12px] text-[var(--color-text-subtle)]">无匹配结果</div>
        )}
        {searchHits.map((h, i) => (
          <div
            key={i}
            onClick={() => openFile(h.path, basename(h.path))}
            className="px-3 py-2 cursor-pointer hover:bg-[color-mix(in_oklab,var(--color-text)_6%,transparent)] mx-1 rounded-md"
          >
            <div className="text-[12px] text-[var(--color-accent)] truncate">
              {basename(h.path)} · {h.line}
            </div>
            <div className="text-[12px] text-[var(--color-text-muted)] truncate mt-0.5 font-mono">
              {h.preview}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
