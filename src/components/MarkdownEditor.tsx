import { useEffect, useMemo, useRef, useState } from "react";
import { Crepe } from "@milkdown/crepe";
import { editorViewCtx } from "@milkdown/kit/core";
import { replaceAll } from "@milkdown/utils";
import "@milkdown/crepe/theme/common/style.css";
import "@milkdown/crepe/theme/frame.css";
import "katex/dist/katex.min.css";
// marked is only used on the rare Crepe-parse-failure fallback path.
// Dynamic import keeps its ~50KB out of the main bundle for the 99% case.
const getMarked = () => import("marked").then((m) => m.marked);
import { useStore } from "../store";
import { renderEmbeds, reinitMermaidTheme, renderFallbackEmbeds } from "../utils/embeds";
import { sanitizeForCrepe } from "../utils/sanitize";
import { wikilinkPlugin } from "../utils/milkdown-wikilink";
import { imageGenPlugin } from "../utils/milkdown-image-gen";
import { tagPlugin } from "../utils/milkdown-tag";
import { SelectionMenu } from "./SelectionMenu";
import { AmbientLight } from "./AmbientLight";

interface Props {
  value: string;
  onChange: (v: string) => void;
  filePath: string;
  fileName: string;
  dirty: boolean;
  theme: "light" | "dark";
}

const OUTPUT_RE = /\b(console\.log|console\.error|console\.warn|console\.info|echo\s|print\(|println!?\(|fmt\.Println|System\.out\.print)/;

/** Mark code blocks containing output statements & inject RUN button. */
function enhanceCodeBlocks(root: HTMLElement) {
  const blocks = root.querySelectorAll<HTMLElement>(".milkdown-code-block");
  blocks.forEach((block) => {
    const code = block.querySelector(".cm-content")?.textContent ?? "";
    // Skip the regex + DOM mutation if the code text hasn't changed since
    // the last check. Saves a regex pass per block per render in long docs.
    if (block.dataset.mfRunCheckCode === code) return;
    block.dataset.mfRunCheckCode = code;
    const hasOutput = OUTPUT_RE.test(code);
    if (hasOutput) {
      block.dataset.hasOutput = "true";
      if (!block.querySelector(".mf-run-btn")) {
        const btn = document.createElement("div");
        btn.className = "mf-run-btn";
        btn.textContent = "[ run in terminal ]";
        btn.setAttribute("data-mf-skip", "true");
        btn.contentEditable = "false";
        btn.addEventListener("mousedown", (e) => e.preventDefault());
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          block.classList.remove("matrix-flash");
          // Re-trigger animation
          void block.offsetWidth;
          block.classList.add("matrix-flash");
          setTimeout(() => block.classList.remove("matrix-flash"), 800);
        });
        block.appendChild(btn);
      }
    } else {
      delete block.dataset.hasOutput;
    }
  });
}

function countWords(text: string): number {
  if (!text) return 0;
  const plain = text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/[#>*_~\-]/g, " ");
  const cjk = (plain.match(/[一-鿿぀-ヿ가-힯]/g) || []).length;
  const words = (plain.match(/[A-Za-z0-9]+/g) || []).length;
  return cjk + words;
}

function readingTime(words: number): string {
  const min = Math.max(1, Math.round(words / 250));
  return `${min} 分钟阅读`;
}

export function MarkdownEditor({ value, onChange, filePath, fileName, dirty, theme }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorMountRef = useRef<HTMLDivElement>(null);
  const crepeRef = useRef<Crepe | null>(null);
  const onChangeRef = useRef(onChange);
  const lastEmittedRef = useRef<string>(value);
  onChangeRef.current = onChange;

  const [fallback, setFallback] = useState<null | { html: string; error: string }>(null);
  const fallbackRef = useRef<HTMLDivElement>(null);
  // The currently-active file as known to Crepe. Updated by the file-switch
  // effect BEFORE replaceAll runs. The Crepe markdownUpdated callback reads
  // .current to tag pending-change entries with the correct origin path —
  // critical for not misrouting A's pending edits into B during a fast switch.
  const lastSwitchedPathRef = useRef<string>(filePath);

  // Render mermaid/svg blocks inside the read-only fallback HTML
  useEffect(() => {
    if (!fallback || !fallbackRef.current) return;
    renderFallbackEmbeds(fallbackRef.current, theme);
  }, [fallback, theme]);

  // Cmd/Ctrl + click on a wikilink decoration → navigate
  useEffect(() => {
    const el = editorMountRef.current;
    if (!el) return;
    const onClick = (e: MouseEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const target = e.target as HTMLElement | null;
      const wikilink = target?.closest?.(".mf-wikilink");
      if (!wikilink) return;
      const name = (wikilink as HTMLElement).dataset.target;
      if (!name) return;
      e.preventDefault();
      e.stopPropagation();
      window.dispatchEvent(
        new CustomEvent("markflow:open-wikilink", { detail: { name } }),
      );
    };
    el.addEventListener("mousedown", onClick, true);
    return () => el.removeEventListener("mousedown", onClick, true);
  }, []);

  // Listen for external insert events (e.g. AI panel "插入到光标")
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ text: string; filePath?: string }>).detail;
      if (!detail?.text) return;
      if (detail.filePath && detail.filePath !== filePath) return;
      const crepe = crepeRef.current;
      if (!crepe) return;
      try {
        crepe.editor.action((ctx) => {
          const view = ctx.get(editorViewCtx);
          const tr = view.state.tr.insertText(detail.text);
          view.dispatch(tr);
          view.focus();
        });
      } catch (err) {
        console.error("[MarkdownEditor] insert failed:", err);
      }
    };
    window.addEventListener("markflow:insert", handler as EventListener);
    return () => window.removeEventListener("markflow:insert", handler as EventListener);
  }, [filePath]);

  useEffect(() => {
    reinitMermaidTheme(theme);
    if (editorMountRef.current) {
      editorMountRef.current.querySelectorAll(".mf-embed").forEach((el) => {
        (el as HTMLElement).dataset.code = "";
      });
      renderEmbeds(editorMountRef.current, filePath, theme);
    }
  }, [theme, filePath]);

  // Crepe LIFECYCLE — created exactly once on mount, destroyed on unmount.
  // File switches do NOT recreate it (would destroy + recreate every nested
  // CodeMirror instance, the dominant lag source). Instead, a separate
  // effect below calls replaceAll() to swap content when filePath changes.
  useEffect(() => {
    if (!editorMountRef.current) return;
    setFallback(null);

    const crepe = new Crepe({
      root: editorMountRef.current,
      defaultValue: sanitizeForCrepe(value),
    });

    // Inject wikilink decorations + image-gen keymap plugins before create
    try {
      crepe.editor.use(wikilinkPlugin);
      crepe.editor.use(imageGenPlugin);
      crepe.editor.use(tagPlugin);
    } catch (e) {
      console.warn("[MarkdownEditor] failed to register plugins", e);
    }

    // Debounce onChange — markdown serialization + store update + word count
    // are all O(n) on full doc. 150ms means a quick burst of typing only
    // triggers ONE downstream update instead of one per keystroke.
    //
    // The pending entry carries its origin path because Crepe is now REUSED
    // across file switches. If the user types in file A then quickly switches
    // to file B before debounce fires, we still need to persist A's edits to
    // A's path — NOT to B's. We capture the path at markdownUpdated time
    // and use the store directly to bypass any stale onChangeRef closure.
    let onChangeTimer: number | null = null;
    let pendingEntry: { path: string; content: string } | null = null;
    const flushOnChange = () => {
      if (onChangeTimer != null) {
        clearTimeout(onChangeTimer);
        onChangeTimer = null;
      }
      if (pendingEntry != null) {
        const { path: p, content } = pendingEntry;
        pendingEntry = null;
        // Direct store write — path is the one captured when the edit happened
        try {
          useStore.getState().setContent(p, content);
        } catch (e) {
          console.warn("[MarkdownEditor] flush setContent failed", e);
        }
      }
    };

    crepe.on((listener) => {
      listener.markdownUpdated((_ctx, md) => {
        lastEmittedRef.current = md;
        // lastSwitchedPathRef is updated BEFORE replaceAll on each switch
        pendingEntry = { path: lastSwitchedPathRef.current, content: md };
        if (onChangeTimer != null) clearTimeout(onChangeTimer);
        onChangeTimer = window.setTimeout(flushOnChange, 150);
      });
    });

    // Debounce render-side work: renderEmbeds (full-doc querySelectorAll x3)
    // + enhanceCodeBlocks (regex on every block) used to fire on every DOM
    // mutation via rAF. For long docs this could fire 60Hz mid-typing and
    // re-process every mermaid block. 200ms post-burst is the sweet spot —
    // user can't perceive the delay but the work collapses by 30-50x.
    let renderTimer: number | null = null;
    const scheduleRender = () => {
      if (renderTimer != null) clearTimeout(renderTimer);
      renderTimer = window.setTimeout(() => {
        renderTimer = null;
        if (editorMountRef.current) {
          renderEmbeds(editorMountRef.current, filePath, theme);
          enhanceCodeBlocks(editorMountRef.current);
        }
      }, 200);
    };

    const observer = new MutationObserver((muts) => {
      const meaningful = muts.some((m) => {
        const target = m.target as HTMLElement;
        if (target?.closest?.("[data-mf-skip='true']")) return false;
        return true;
      });
      if (meaningful) scheduleRender();
    });

    // Allow external triggers (e.g. ⌘S handler) to force-flush pending content
    // before save. Without this, the 150ms onChange debounce could save a
    // stale value if the user types and immediately hits save.
    const flushListener = () => flushOnChange();
    window.addEventListener("markflow:flush-editor", flushListener);

    crepe
      .create()
      .then(() => {
        crepeRef.current = crepe;
        observer.observe(editorMountRef.current!, {
          childList: true,
          subtree: true,
          characterData: true,
          attributes: true,
          attributeFilter: ["class", "data-language"],
        });
        setTimeout(() => {
          if (editorMountRef.current) renderEmbeds(editorMountRef.current, filePath, theme);
        }, 100);
      })
      .catch(async (err) => {
        console.error("[MarkdownEditor] Crepe failed:", filePath, err);
        try {
          const marked = await getMarked();
          const html = await marked.parse(value);
          setFallback({ html: html as string, error: String(err?.message || err) });
        } catch (e2) {
          setFallback({
            html: `<pre style="white-space:pre-wrap;padding:16px;">${value
              .replace(/&/g, "&amp;")
              .replace(/</g, "&lt;")
              .replace(/>/g, "&gt;")}</pre>`,
            error: String(err?.message || err),
          });
        }
      });

    return () => {
      observer.disconnect();
      window.removeEventListener("markflow:flush-editor", flushListener);
      if (renderTimer != null) clearTimeout(renderTimer);
      flushOnChange();             // flush any pending markdown before tearing down
      crepe.destroy();
      crepeRef.current = null;
    };
    // Mount-only — file switches handled by the dedicated effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // FILE SWITCH — when filePath changes, replace the Crepe document content
  // without destroying the editor instance. Wait briefly if Crepe is still
  // creating (initial mount race), retry up to ~500ms.
  useEffect(() => {
    if (lastSwitchedPathRef.current === filePath) return;  // first run, same path
    // Flush any pending edits for the OUTGOING file FIRST — the markdownUpdated
    // listener captures path via lastSwitchedPathRef.current, so we want
    // pending entries to be tagged with the OLD path before we update it.
    window.dispatchEvent(new Event("markflow:flush-editor"));
    lastSwitchedPathRef.current = filePath;
    setFallback(null);
    lastEmittedRef.current = value;

    let attempts = 0;
    const tryReplace = () => {
      const crepe = crepeRef.current;
      if (!crepe) {
        if (++attempts < 10) setTimeout(tryReplace, 50);
        return;
      }
      try {
        crepe.editor.action(replaceAll(sanitizeForCrepe(value)));
        // After content swap, re-fire embed render for new mermaid blocks
        if (editorMountRef.current) {
          renderEmbeds(editorMountRef.current, filePath, theme);
        }
      } catch (err) {
        console.warn("[MarkdownEditor] replaceAll failed, falling back", err);
        // If replaceAll fails (rare — malformed markdown), fall back to
        // read-only HTML for this file. Crepe stays alive for next file.
        (async () => {
          try {
            const marked = await getMarked();
            const html = await marked.parse(value);
            setFallback({ html: html as string, error: String((err as Error)?.message || err) });
          } catch {
            setFallback({
              html: `<pre style="white-space:pre-wrap;padding:16px;">${value
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")}</pre>`,
              error: String((err as Error)?.message || err),
            });
          }
        })();
      }
    };
    tryReplace();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filePath]);

  const words = useMemo(() => countWords(value), [value]);
  const title = fileName.replace(/\.(md|markdown)$/i, "");

  return (
    <div className="h-full flex flex-col bg-[var(--color-bg)] overflow-hidden">
      <div ref={containerRef} className="flex-1 min-h-0 overflow-auto">
        <div className="md-doc-header">
          <h1 className="md-doc-title">{title}</h1>
          <div className="md-doc-meta">
            <span>{words} 字</span>
            <span className="md-doc-dot">·</span>
            <span>{readingTime(words)}</span>
            <span className="md-doc-dot">·</span>
            <span className={dirty ? "md-doc-dirty" : "md-doc-saved"}>
              {dirty ? "未保存" : "已保存"}
            </span>
            {fallback && (
              <>
                <span className="md-doc-dot">·</span>
                <span className="md-doc-fallback">只读模式</span>
              </>
            )}
          </div>
          <div className="md-doc-rule" />
        </div>
        {fallback ? (
          <div className="md-fallback-wrap">
            <div className="md-fallback-banner">
              <strong>编辑器无法解析此文档</strong>
              <span className="md-fallback-error">{fallback.error}</span>
              <span className="md-fallback-hint">
                已切换为只读 HTML 预览。常见原因：文档含 Crepe 不支持的顶层裸 HTML 标签（如孤立的 &lt;br/&gt; / &lt;div&gt;）。修复源文件后重新打开即可。
              </span>
            </div>
            <div
              ref={fallbackRef}
              className="md-fallback-content"
              dangerouslySetInnerHTML={{ __html: fallback.html }}
            />
          </div>
        ) : (
          <>
            <div ref={editorMountRef} />
            <InDocBacklinks filePath={filePath} />
          </>
        )}
      </div>
      {!fallback && (
        <>
          <SelectionMenu containerRef={editorMountRef} />
          <AmbientLight containerRef={editorMountRef} />
        </>
      )}
    </div>
  );
}

/** In-doc backlinks footer — auto-shows below the markdown content when the
 *  current file is referenced by other notes (via wikilinks or md links).
 *  Reuses the same `get_backlinks` Rust command that powers the side panel. */
function InDocBacklinks({ filePath }: { filePath: string }) {
  const { backlinks, backlinksTarget, loadBacklinks, openFile } = useStore();
  useEffect(() => {
    if (!filePath) return;
    // Reuse the panel's cache when the active doc matches what's already loaded
    if (backlinksTarget !== filePath) {
      loadBacklinks(filePath).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filePath]);

  // Only render when we have backlinks AND they target the current file
  if (backlinksTarget !== filePath || !backlinks.length) return null;

  // Group by source file
  const grouped = new Map<string, typeof backlinks>();
  backlinks.forEach((b) => {
    const arr = grouped.get(b.source) ?? [];
    arr.push(b);
    grouped.set(b.source, arr);
  });
  const sources = Array.from(grouped.keys()).sort();

  return (
    <div className="indoc-backlinks">
      <div className="indoc-backlinks-title">
        <span>反链 · {backlinks.length} 处</span>
      </div>
      <div className="indoc-backlinks-list">
        {sources.map((src) => {
          const items = grouped.get(src) ?? [];
          const name = src.split(/[\\/]/).pop() ?? src;
          return (
            <div key={src} className="indoc-backlinks-group">
              <button
                onClick={() => openFile(src, name)}
                className="indoc-backlinks-source"
                title={src}
              >
                {name.replace(/\.(md|markdown)$/i, "")}
                <span className="indoc-backlinks-count">{items.length}</span>
              </button>
              {items.slice(0, 3).map((b, i) => (
                <button
                  key={i}
                  onClick={() => openFile(src, name)}
                  className="indoc-backlinks-snippet"
                  title={`L${b.line}`}
                >
                  <span className="indoc-backlinks-line">L{b.line}</span>
                  <span className="indoc-backlinks-preview">{b.preview}</span>
                </button>
              ))}
              {items.length > 3 && (
                <div className="indoc-backlinks-more">…还有 {items.length - 3} 处</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
