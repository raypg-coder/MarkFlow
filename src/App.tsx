import { useEffect, useRef, useState } from "react";
import {
  Save,
  Search,
  FileDown,
  ChevronLeft,
  ChevronRight,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  FolderTree,
  ListTree,
  Link2,
  Network,
  Brain,
  Sparkles,
  Target,
} from "lucide-react";
import type { RightSidebarView } from "./types";
import { useStore } from "./store";
import { FileTree } from "./components/FileTree";
import { MissionPanel } from "./components/MissionPanel";
import { TabBar } from "./components/TabBar";
import { Editor } from "./components/Editor";
import { SearchPanel } from "./components/SearchPanel";
import { StatusBar } from "./components/StatusBar";
import { Ribbon } from "./components/Ribbon";
import { RightSidebar } from "./components/RightSidebar";
import { SettingsModal } from "./components/SettingsModal";
import { generateAndSaveImage } from "./utils/image-gen";
import { appVersion as fetchAppVersion, checkForUpdate } from "./utils/updater";
import { exportMarkdownToHtml, exportMarkdownToPdf } from "./utils/export";

function App() {
  const {
    saveActive,
    openFiles,
    activePath,
    sidebarView,
    sidebarOpen,
    setSidebarView,
    toggleSidebar,
    rightSidebarOpen,
    rightSidebarView,
    setRightSidebarView,
    toggleRightSidebar,
  } = useStore();

  const [sidebarWidth, setSidebarWidth] = useState(244);
  const [rightSidebarWidth, setRightSidebarWidth] = useState(280);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [resizing, setResizing] = useState<null | "left" | "right">(null);
  const resizingRef = useRef<null | "left" | "right">(null);
  const [focusMode, setFocusMode] = useState(false);
  const zenMode = useStore((s) => s.zenMode);

  const theme = useStore((s) => s.theme);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  useEffect(() => {
    useStore.getState().restoreTrees();
    useStore.getState().loadVectorIndex();
    // Fetch app version + silent background update check (best-effort)
    fetchAppVersion().then((v) => useStore.getState().setAppVersion(v)).catch(() => {});
    const t = setTimeout(async () => {
      try {
        const r = await checkForUpdate();
        const set = useStore.getState().setUpdateState;
        if (r.available) {
          set({ kind: "available", info: r.info, checkedAt: Date.now() });
        }
        // Silent: don't toast if up-to-date or endpoint unreachable
      } catch {
        /* silent — endpoint may not be configured yet */
      }
    }, 3000);
    return () => clearTimeout(t);
  }, []);

  // ─── Focus mode — "zen typewriter" ────────────────────────────
  // Activate when user types continuously for >3s AND mouse hasn't moved
  // for >1.5s. Deactivate on any mouse move OR if typing stops for >1.5s.
  useEffect(() => {
    let streakStart = 0;
    let lastKey = 0;
    let lastMouse = Date.now();
    let active = false;
    const TYPING_GAP_MS = 1500;
    const ENTER_AFTER_MS = 3000;
    const MOUSE_QUIET_MS = 1500;

    const onKey = (e: KeyboardEvent) => {
      // Ignore modifier-only or non-typing keys
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const isTyping =
        e.key.length === 1 ||
        e.key === " " ||
        e.key === "Enter" ||
        e.key === "Backspace" ||
        e.key === "Tab";
      if (!isTyping) return;
      // Only count keys typed inside the actual editor (not sidebar inputs / modal)
      const target = e.target as HTMLElement | null;
      const inEditor = !!target?.closest?.(".milkdown, .cm-editor");
      if (!inEditor) return;
      const now = Date.now();
      if (streakStart === 0 || now - lastKey > TYPING_GAP_MS) {
        streakStart = now;
      }
      lastKey = now;
    };

    const onMouse = () => {
      lastMouse = Date.now();
      streakStart = 0;
      lastKey = 0;
      if (active) {
        active = false;
        setFocusMode(false);
      }
    };

    const tick = () => {
      const now = Date.now();
      const typingStreakOk =
        streakStart > 0 &&
        now - streakStart > ENTER_AFTER_MS &&
        now - lastKey < TYPING_GAP_MS;
      const mouseQuietOk = now - lastMouse > MOUSE_QUIET_MS;
      const shouldFocus = typingStreakOk && mouseQuietOk;
      if (shouldFocus !== active) {
        active = shouldFocus;
        setFocusMode(shouldFocus);
      }
    };
    const intv = setInterval(tick, 250);
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("mousemove", onMouse, true);
    return () => {
      clearInterval(intv);
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("mousemove", onMouse, true);
    };
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ name: string }>).detail;
      if (!detail?.name) return;
      useStore.getState().openWikilink(detail.name);
    };
    window.addEventListener("markflow:open-wikilink", handler as EventListener);
    return () => window.removeEventListener("markflow:open-wikilink", handler as EventListener);
  }, []);

  // /image PROMPT slash command → generate image, save, insert markdown
  useEffect(() => {
    const handler = async (e: Event) => {
      const detail = (e as CustomEvent<{ prompt: string }>).detail;
      if (!detail?.prompt) return;
      const { llmSettings, roots, activePath: ap, setImageGenStatus } =
        useStore.getState();
      if (!ap) {
        setImageGenStatus({
          phase: "error",
          prompt: detail.prompt,
          message: "未打开任何文件",
        });
        setTimeout(() => useStore.getState().setImageGenStatus(null), 3000);
        return;
      }
      if (roots.length === 0) {
        setImageGenStatus({
          phase: "error",
          prompt: detail.prompt,
          message: "请先添加工作区",
        });
        setTimeout(() => useStore.getState().setImageGenStatus(null), 3000);
        return;
      }
      if (!llmSettings.imageModel) {
        setImageGenStatus({
          phase: "error",
          prompt: detail.prompt,
          message: "未配置生图模型",
        });
        setTimeout(() => useStore.getState().setImageGenStatus(null), 3000);
        return;
      }
      setImageGenStatus({ phase: "generating", prompt: detail.prompt });
      try {
        const { markdown } = await generateAndSaveImage(
          llmSettings,
          detail.prompt,
          roots[0],
          ap,
        );
        setImageGenStatus({ phase: "saving", prompt: detail.prompt });
        window.dispatchEvent(
          new CustomEvent("markflow:insert", {
            detail: { text: markdown, filePath: ap },
          }),
        );
        setTimeout(() => useStore.getState().setImageGenStatus(null), 600);
      } catch (err: any) {
        setImageGenStatus({
          phase: "error",
          prompt: detail.prompt,
          message: String(err?.message ?? err),
        });
        setTimeout(() => useStore.getState().setImageGenStatus(null), 4000);
      }
    };
    window.addEventListener("markflow:gen-image", handler as EventListener);
    return () => window.removeEventListener("markflow:gen-image", handler as EventListener);
  }, []);

  // AI action from selection menu → switch to AI view + prefill input
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{
        action: "explain" | "summarize" | "rewrite" | "translate";
        text: string;
      }>).detail;
      if (!detail?.text) return;
      const verb: Record<typeof detail.action, string> = {
        explain: "请解释下面这段内容：",
        summarize: "请用 3 个要点总结下面这段内容：",
        rewrite: "请用更清晰、流畅的表达改写下面这段（保持原意）：",
        translate: "请翻译下面这段（中→英或英→中，自动判断）：",
      };
      const prompt = `${verb[detail.action]}\n\n${detail.text}`;
      useStore.getState().setRightSidebarView("ai");
      useStore.getState().setAiPrefill(prompt);
    };
    window.addEventListener("markflow:ai-action", handler as EventListener);
    return () => window.removeEventListener("markflow:ai-action", handler as EventListener);
  }, []);

  useEffect(() => {
    let lastFiredAt = 0;
    const handler = () => {
      const now = Date.now();
      if (now - lastFiredAt < 1500) return;
      lastFiredAt = now;
      useStore.getState().refreshAllTrees().catch(console.error);
    };
    window.addEventListener("focus", handler);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") handler();
    });
    return () => {
      window.removeEventListener("focus", handler);
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key === "s") {
        e.preventDefault();
        saveActive();
      }
      if (mod && e.shiftKey && e.key.toLowerCase() === "f") {
        e.preventDefault();
        setSidebarView("search");
      }
      if (mod && e.key === "\\") {
        e.preventDefault();
        toggleSidebar();
      }
      if (mod && e.key === "1") {
        e.preventDefault();
        setSidebarView("files");
      }
      // ⌘⇧Z → toggle Matrix Zen Mode
      if (mod && e.shiftKey && e.key.toLowerCase() === "z") {
        e.preventDefault();
        useStore.getState().toggleZenMode();
      }
      // Esc — exit zen mode
      if (e.key === "Escape" && useStore.getState().zenMode) {
        e.preventDefault();
        useStore.getState().toggleZenMode();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [saveActive, setSidebarView, toggleSidebar]);

  useEffect(() => {
    const file = openFiles.find((f) => f.path === activePath);
    if (!file) return;
    if (file.content === file.savedContent) return;
    const t = setTimeout(() => {
      useStore.getState().saveFile(file.path).catch(console.error);
    }, 1200);
    return () => clearTimeout(t);
  }, [openFiles, activePath]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (resizingRef.current === "left") {
        const w = Math.min(Math.max(e.clientX - 40, 180), 480);
        setSidebarWidth(w);
      } else if (resizingRef.current === "right") {
        const w = Math.min(Math.max(window.innerWidth - e.clientX, 200), 520);
        setRightSidebarWidth(w);
      }
    };
    const onUp = () => {
      resizingRef.current = null;
      setResizing(null);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  const activeFile = openFiles.find((f) => f.path === activePath);
  const canExport = activeFile?.kind === "markdown";
  const canSave = activeFile && activeFile.content !== activeFile.savedContent;
  const history = useStore((s) => s.history);
  const historyIndex = useStore((s) => s.historyIndex);
  const canBack = historyIndex > 0;
  const canForward = historyIndex < history.length - 1;

  const pickView = (v: "files" | "search" | "missions") => {
    if (sidebarView === v && sidebarOpen) toggleSidebar();
    else setSidebarView(v);
  };

  return (
    <div className={`flex flex-col h-full bg-[var(--color-bg-chrome)] text-[var(--color-text)] ${focusMode ? "focus-mode" : ""} ${zenMode ? "zen-mode" : ""}`}>
      {/* Unified top strip — zone-aligned with the columns below */}
      <div
        data-tauri-drag-region
        className="app-topbar chrome-fade chrome-fade-top flex items-end h-11 select-none shrink-0"
      >
        {/* Ribbon zone — drag region only, traffic lights overlay */}
        <div data-tauri-drag-region className="w-10 shrink-0 self-stretch" />

        {/* Sidebar zone — view switchers + panel-collapse */}
        {sidebarOpen && (
          <div className="flex items-center shrink-0 self-stretch" style={{ width: sidebarWidth }}>
            {/* extra traffic-light clearance so view switchers don't sit under the buttons */}
            <div data-tauri-drag-region className="w-9 shrink-0 self-stretch" />
            <div className="flex items-center gap-0.5 flex-1 min-w-0 px-1">
              <button
                onClick={() => pickView("files")}
                title="文件 (⌘1)"
                className={`p-1.5 rounded-sm ${
                  sidebarView === "files"
                    ? "bg-[var(--chrome-bg-soft)] text-[var(--chrome-accent)]"
                    : "text-[var(--chrome-text-muted)] hover:bg-[var(--chrome-bg-soft)] hover:text-[var(--chrome-text)]"
                }`}
              >
                <FolderTree size={15} strokeWidth={1.75} />
              </button>
              <button
                onClick={() => pickView("search")}
                title="搜索 (⌘⇧F)"
                className={`p-1.5 rounded-sm ${
                  sidebarView === "search"
                    ? "bg-[var(--chrome-bg-soft)] text-[var(--chrome-accent)]"
                    : "text-[var(--chrome-text-muted)] hover:bg-[var(--chrome-bg-soft)] hover:text-[var(--chrome-text)]"
                }`}
              >
                <Search size={15} strokeWidth={1.75} />
              </button>
              <button
                onClick={() => pickView("missions")}
                title="missions"
                className={`p-1.5 rounded-sm ${
                  sidebarView === "missions"
                    ? "bg-[var(--chrome-bg-soft)] text-[var(--chrome-accent)]"
                    : "text-[var(--chrome-text-muted)] hover:bg-[var(--chrome-bg-soft)] hover:text-[var(--chrome-text)]"
                }`}
              >
                <Target size={15} strokeWidth={1.75} />
              </button>
            </div>
            <button
              onClick={toggleSidebar}
              title="收起侧栏 (⌘\\)"
              className="p-1.5 rounded-sm mr-1.5 text-[var(--chrome-text-muted)] hover:bg-[var(--chrome-bg-soft)] hover:text-[var(--chrome-text)]"
            >
              <PanelLeftClose size={15} strokeWidth={1.75} />
            </button>
          </div>
        )}

        {/* Editor zone — nav + tabs + pane actions */}
        <div className="flex-1 min-w-0 flex items-end self-stretch">
          <div className="flex items-center self-stretch gap-0.5 px-2">
            {!sidebarOpen && (
              <>
                <div data-tauri-drag-region className="w-9 shrink-0 self-stretch -ml-2" />
                <button
                  onClick={toggleSidebar}
                  title="展开侧栏 (⌘\\)"
                  className="p-1.5 rounded-sm text-[var(--chrome-text-muted)] hover:bg-[var(--chrome-bg-soft)] hover:text-[var(--chrome-text)]"
                >
                  <PanelLeftOpen size={15} strokeWidth={1.75} />
                </button>
              </>
            )}
            <button
              onClick={() => useStore.getState().navBack()}
              disabled={!canBack}
              title="后退"
              className={`p-1.5 rounded-sm ${
                canBack
                  ? "text-[var(--chrome-text-muted)] hover:bg-[var(--chrome-bg-soft)] hover:text-[var(--chrome-text)]"
                  : "text-[var(--chrome-text-subtle)] cursor-not-allowed"
              }`}
            >
              <ChevronLeft size={15} strokeWidth={1.75} />
            </button>
            <button
              onClick={() => useStore.getState().navForward()}
              disabled={!canForward}
              title="前进"
              className={`p-1.5 rounded-sm ${
                canForward
                  ? "text-[var(--chrome-text-muted)] hover:bg-[var(--chrome-bg-soft)] hover:text-[var(--chrome-text)]"
                  : "text-[var(--chrome-text-subtle)] cursor-not-allowed"
              }`}
            >
              <ChevronRight size={15} strokeWidth={1.75} />
            </button>
          </div>

          <div className="flex-1 min-w-0 flex items-end self-stretch">
            <TabBar />
          </div>

          <div className="flex items-center self-stretch gap-0.5 px-2">
            <button
              onClick={() => saveActive()}
              title="保存 (⌘S)"
              disabled={!canSave}
              className={`p-1.5 rounded-sm ${
                canSave
                  ? "text-[var(--chrome-accent)] hover:bg-[var(--chrome-bg-soft)]"
                  : "text-[var(--chrome-text-subtle)] cursor-not-allowed"
              }`}
            >
              <Save size={14} strokeWidth={1.75} />
            </button>
            <div className="relative">
              <button
                onClick={() => setShowExportMenu((v) => !v)}
                disabled={!canExport}
                title="导出 (仅 Markdown)"
                className={`p-1.5 rounded-sm ${
                  canExport
                    ? "hover:bg-[var(--color-bg-soft)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                    : "text-[var(--chrome-text-subtle)] cursor-not-allowed"
                }`}
              >
                <FileDown size={14} strokeWidth={1.75} />
              </button>
              {showExportMenu && canExport && activeFile && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowExportMenu(false)} />
                  <div className="absolute right-0 top-full mt-1.5 z-50 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-sm shadow-lg shadow-black/5 py-1 min-w-[140px]">
                    <button
                      className="block w-full text-left px-3 py-1.5 text-[12.5px] hover:bg-[var(--color-bg-soft)]"
                      onClick={async () => {
                        setShowExportMenu(false);
                        await exportMarkdownToHtml(activeFile.name, activeFile.content);
                      }}
                    >
                      导出为 HTML
                    </button>
                    <button
                      className="block w-full text-left px-3 py-1.5 text-[12.5px] hover:bg-[var(--color-bg-soft)]"
                      onClick={async () => {
                        setShowExportMenu(false);
                        await exportMarkdownToPdf(activeFile.name, activeFile.content);
                      }}
                    >
                      导出为 PDF
                    </button>
                  </div>
                </>
              )}
            </div>
            {!rightSidebarOpen && (
              <button
                onClick={toggleRightSidebar}
                title="展开右侧栏"
                className="p-1.5 rounded-sm text-[var(--chrome-text-muted)] hover:bg-[var(--chrome-bg-soft)] hover:text-[var(--chrome-text)]"
              >
                <PanelRightOpen size={15} strokeWidth={1.75} />
              </button>
            )}
          </div>
        </div>

        {/* Right sidebar zone in top strip */}
        {rightSidebarOpen && (
          <div className="flex items-center shrink-0 self-stretch" style={{ width: rightSidebarWidth }}>
            <button
              onClick={toggleRightSidebar}
              title="收起右侧栏"
              className="p-1.5 rounded-sm ml-1.5 text-[var(--chrome-text-muted)] hover:bg-[var(--chrome-bg-soft)] hover:text-[var(--chrome-text)]"
            >
              <PanelRightClose size={15} strokeWidth={1.75} />
            </button>
            <div className="flex items-center gap-0.5 flex-1 min-w-0 px-1 overflow-x-auto">
              {(
                [
                  { view: "outline", icon: ListTree, title: "大纲" },
                  { view: "backlinks", icon: Link2, title: "反链" },
                  { view: "graph", icon: Network, title: "图谱" },
                  { view: "smartlookup", icon: Brain, title: "语义检索" },
                  { view: "ai", icon: Sparkles, title: "AI 助手" },
                ] as { view: RightSidebarView; icon: typeof ListTree; title: string }[]
              ).map(({ view, icon: Icon, title }) => (
                <button
                  key={view}
                  onClick={() => setRightSidebarView(view)}
                  title={title}
                  className={`p-1.5 rounded-sm shrink-0 ${
                    rightSidebarView === view
                      ? "bg-[var(--chrome-bg-soft)] text-[var(--chrome-accent)]"
                      : "text-[var(--chrome-text-muted)] hover:bg-[var(--chrome-bg-soft)] hover:text-[var(--chrome-text)]"
                  }`}
                >
                  <Icon size={15} strokeWidth={1.75} />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Body */}
      <div className="flex flex-1 min-h-0">
        {/* Left ribbon — always visible */}
        <Ribbon />

        {/* Sidebar — collapsible with mechanical slide */}
        <div
          className="chrome-fade chrome-fade-left flex flex-col bg-[var(--color-bg-soft)] shrink-0 overflow-hidden transition-[width,opacity] duration-[260ms]"
          style={{
            width: sidebarOpen ? sidebarWidth : 0,
            opacity: sidebarOpen ? 1 : 0,
            transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)",
          }}
        >
          <div
            className="flex-1 min-h-0 flex flex-col"
            style={{ width: sidebarWidth, minWidth: sidebarWidth }}
          >
            {sidebarView === "search" ? (
              <SearchPanel />
            ) : sidebarView === "missions" ? (
              <MissionPanel />
            ) : (
              <FileTree />
            )}
          </div>
        </div>
        {sidebarOpen && (
          <div
            className={`resize-handle w-px cursor-col-resize z-10 relative ${resizing === "left" ? "is-dragging" : ""}`}
            onMouseDown={() => {
              resizingRef.current = "left";
              setResizing("left");
            }}
          />
        )}

        {/* Editor column */}
        <div className="flex-1 flex flex-col min-w-0 app-panel">
          <Editor />
          <StatusBar />
        </div>

        {/* Right sidebar — collapsible with mechanical slide */}
        {rightSidebarOpen && (
          <div
            className={`resize-handle w-px cursor-col-resize z-10 relative ${resizing === "right" ? "is-dragging" : ""}`}
            onMouseDown={() => {
              resizingRef.current = "right";
              setResizing("right");
            }}
          />
        )}
        <div
          className="chrome-fade chrome-fade-right flex flex-col bg-[var(--color-bg-soft)] shrink-0 overflow-hidden transition-[width,opacity] duration-[260ms]"
          style={{
            width: rightSidebarOpen ? rightSidebarWidth : 0,
            opacity: rightSidebarOpen ? 1 : 0,
            transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)",
          }}
        >
          <div
            className="flex-1 min-h-0 flex flex-col"
            style={{ width: rightSidebarWidth, minWidth: rightSidebarWidth }}
          >
            <RightSidebar />
          </div>
        </div>
      </div>

      <SettingsModal />
      <ImageGenToast />
      <div className="focus-mode-indicator" />
    </div>
  );
}

function ImageGenToast() {
  const status = useStore((s) => s.imageGenStatus);
  if (!status) return null;
  const isError = status.phase === "error";
  return (
    <div className="fixed bottom-6 right-6 z-[90] max-w-[360px]">
      <div
        className={`flex items-start gap-2.5 px-3 py-2.5 rounded-sm shadow-lg shadow-black/15 text-[12.5px] ${
          isError
            ? "bg-[var(--md-rose-soft)] text-[var(--md-rose)] border border-[var(--md-rose)]/30"
            : "bg-[var(--color-bg)] text-[var(--color-text)] border border-[var(--color-border)]"
        }`}
      >
        {!isError && (
          <div className="w-3 h-3 mt-0.5 rounded-full border-2 border-[var(--color-accent)] border-t-transparent animate-spin" />
        )}
        <div className="flex-1 min-w-0">
          <div className="font-medium">
            {status.phase === "generating" && "正在生成图片…"}
            {status.phase === "saving" && "保存中…"}
            {status.phase === "error" && "生成失败"}
          </div>
          <div className="text-[11px] opacity-75 mt-0.5 truncate">
            {isError ? status.message : status.prompt}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
