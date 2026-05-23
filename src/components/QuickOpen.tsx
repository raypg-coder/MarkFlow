import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useStore } from "../store";
import type { MdFileMeta } from "../utils/indexer";

/**
 * Cmd+P / Ctrl+P quick file switcher.
 *
 * Opens a modal listing all .md files across workspace roots. Fuzzy-matched
 * against the user's query. Up/Down to navigate, Enter to open, Esc to close.
 *
 * Sourced via the existing `list_md_files_meta` Rust command — same data
 * the vector indexer uses. Refreshed each time the modal opens (cheap on
 * vault < 5k files).
 */

interface ScoredFile {
  path: string;
  name: string;
  score: number;
  matches: number[];   // char indices that matched (for highlighting)
}

/**
 * Cheap subsequence-fuzzy matcher (à la VS Code / Sublime).
 * Returns null if no match, otherwise `{ score, matches }` where higher
 * score = better match. Char-class transitions and consecutive matches
 * are rewarded; gaps are penalized.
 */
function fuzzyMatch(query: string, text: string): { score: number; matches: number[] } | null {
  if (!query) return { score: 0, matches: [] };
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  const matches: number[] = [];
  let qi = 0;
  let prevIdx = -1;
  let score = 0;
  let consecutive = 0;
  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] === q[qi]) {
      matches.push(i);
      // Reward start-of-word matches
      const isStart = i === 0 || /[\s/\\._-]/.test(t[i - 1]);
      if (isStart) score += 6;
      else score += 1;
      // Reward consecutive matches
      if (prevIdx === i - 1) {
        consecutive++;
        score += consecutive * 2;
      } else {
        consecutive = 0;
      }
      prevIdx = i;
      qi++;
    }
  }
  if (qi < q.length) return null;
  // Slight bonus for shorter targets (favor "todo.md" over "long/path/todo.md")
  score += Math.max(0, 30 - text.length);
  return { score, matches };
}

const MAX_RESULTS = 12;

export function QuickOpen() {
  const { quickOpenVisible, setQuickOpenVisible, roots, openFile, recentFiles } = useStore();
  const [allFiles, setAllFiles] = useState<MdFileMeta[]>([]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Load file list each time the modal opens (cheap; data is on-disk meta only)
  useEffect(() => {
    if (!quickOpenVisible) return;
    setQuery("");
    setSelected(0);
    if (!roots.length) {
      setAllFiles([]);
      return;
    }
    invoke<MdFileMeta[]>("list_md_files_meta", { roots })
      .then((files) => setAllFiles(files))
      .catch((e) => {
        console.warn("[quick-open] list failed", e);
        setAllFiles([]);
      });
    setTimeout(() => inputRef.current?.focus(), 30);
  }, [quickOpenVisible, roots]);

  const results = useMemo<ScoredFile[]>(() => {
    if (!quickOpenVisible) return [];
    // Empty query → show recently opened files (newest first)
    if (!query.trim()) {
      const knownPaths = new Set(allFiles.map((f) => f.path));
      return recentFiles
        .filter((p) => knownPaths.has(p))      // filter dead links
        .slice(0, MAX_RESULTS)
        .map((path) => ({
          path,
          name: path.split(/[\\/]/).pop() || path,
          score: 0,
          matches: [],
        }));
    }
    const list: ScoredFile[] = [];
    for (const f of allFiles) {
      const name = f.path.split(/[\\/]/).pop() || f.path;
      const hit = fuzzyMatch(query, name);
      if (hit == null) continue;
      list.push({ path: f.path, name, score: hit.score, matches: hit.matches });
    }
    list.sort((a, b) => b.score - a.score);
    return list.slice(0, MAX_RESULTS);
  }, [quickOpenVisible, query, allFiles, recentFiles]);

  // Reset selection when results shrink below current index
  useEffect(() => {
    if (selected >= results.length && results.length > 0) {
      setSelected(0);
    }
  }, [results.length, selected]);

  // Scroll active row into view
  useEffect(() => {
    if (!listRef.current) return;
    const row = listRef.current.children[selected] as HTMLElement | undefined;
    row?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  if (!quickOpenVisible) return null;

  const onPick = async (path: string) => {
    const name = path.split(/[\\/]/).pop() || path;
    setQuickOpenVisible(false);
    try {
      await openFile(path, name);
    } catch (e) {
      console.warn("[quick-open] openFile failed", e);
    }
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      setQuickOpenVisible(false);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelected((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelected((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const target = results[selected];
      if (target) void onPick(target.path);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[110] flex items-start justify-center pt-[14vh] bg-black/55 backdrop-blur-[8px]"
      onClick={() => setQuickOpenVisible(false)}
    >
      <div
        className="w-[560px] max-w-[92vw] bg-[var(--color-bg-soft)] rounded-xl overflow-hidden"
        style={{
          boxShadow: `
            inset 0 0 0 1px var(--glass-border),
            0 0 40px -8px color-mix(in oklab, var(--color-accent) 28%, transparent),
            0 32px 64px rgba(0,0,0,0.55)
          `,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 px-4 py-3 border-b border-[var(--glass-border,var(--color-border))]">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelected(0);
            }}
            onKeyDown={onKey}
            placeholder="搜索文件，或留空查看最近打开…"
            className="flex-1 bg-transparent outline-none text-[13px] text-[var(--color-text)] placeholder:text-[var(--color-text-subtle)]"
          />
          <span className="text-[10px] text-[var(--color-text-subtle)] tabular-nums">
            {results.length}/{allFiles.length}
          </span>
        </div>

        <div ref={listRef} className="max-h-[52vh] overflow-y-auto">
          {!query.trim() && results.length > 0 && (
            <div className="px-4 py-1.5 text-[10px] uppercase tracking-[0.08em] text-[var(--color-text-subtle)] font-semibold">
              最近打开
            </div>
          )}
          {results.length === 0 && (
            <div className="px-4 py-6 text-center text-[12px] text-[var(--color-text-subtle)]">
              {allFiles.length === 0
                ? "工作区里没有 markdown 文件"
                : !query.trim()
                ? "还没有最近打开的文件 — 输入名字搜索"
                : "没有匹配的文件"}
            </div>
          )}
          {results.map((r, i) => {
            const active = i === selected;
            return (
              <div
                key={r.path}
                onMouseEnter={() => setSelected(i)}
                onClick={() => onPick(r.path)}
                className={`px-4 py-2 cursor-pointer ${
                  active
                    ? "bg-[color-mix(in_oklab,var(--color-accent)_12%,transparent)]"
                    : "hover:bg-[var(--color-bg-soft)]"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`font-mono text-[10px] tabular-nums ${
                      active ? "text-[var(--color-accent)]" : "text-[var(--color-text-subtle)]"
                    }`}
                  >
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span
                    className={`text-[13px] truncate ${
                      active ? "text-[var(--color-text)]" : "text-[var(--color-text)]"
                    }`}
                  >
                    {highlight(r.name, r.matches)}
                  </span>
                </div>
                <div className="ml-7 font-mono text-[10.5px] text-[var(--color-text-subtle)] truncate">
                  {r.path}
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between px-4 py-2.5 border-t border-[var(--glass-border,var(--color-border))] text-[10.5px] text-[var(--color-text-subtle)]">
          <span>
            <kbd className="kbd">↑↓</kbd> 移动 · <kbd className="kbd">↵</kbd> 打开 · <kbd className="kbd">Esc</kbd> 关闭
          </span>
          <span className="tabular-nums">⌘P</span>
        </div>
      </div>
    </div>
  );
}

function highlight(text: string, matches: number[]): React.ReactNode {
  if (!matches.length) return text;
  const result: React.ReactNode[] = [];
  let i = 0;
  for (const m of matches) {
    if (m > i) result.push(<span key={`p-${i}`}>{text.slice(i, m)}</span>);
    result.push(
      <span key={`m-${m}`} className="text-[var(--color-accent)] font-semibold">
        {text[m]}
      </span>,
    );
    i = m + 1;
  }
  if (i < text.length) result.push(<span key={`p-${i}`}>{text.slice(i)}</span>);
  return result;
}
