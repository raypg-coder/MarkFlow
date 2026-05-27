import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile, mkdir, remove, rename } from "@tauri-apps/plugin-fs";
import type { FileNode, OpenFile, SearchHit, Backlink, LinkGraph, RightSidebarView, GitFileStatus, Mission, MissionPriority, Workspace } from "./types";
import { detectKind } from "./utils/fileKind";
import { loadLLMSettings, saveLLMSettings, embed, type LLMSettings, type ChatMessage } from "./utils/llm";
import type { UpdateState } from "./utils/updater";
import { scheduleSwap, cancelSwap, deleteSwap, loadAllSwaps } from "./utils/swap";
import { scheduleAutosave, cancelAutosave, flushAllAutosaves } from "./utils/autosave";
import {
  loadIndex,
  clearIndex,
  rebuildIndexFull,
  rebuildIndexIncremental,
  diffIndex,
  searchVec,
  type IndexChunk,
  type IndexProgress,
  type ScoredHit,
  type MdFileMeta,
} from "./utils/indexer";

interface State {
  roots: string[];
  trees: Record<string, FileNode>;
  expanded: Set<string>;
  openFiles: OpenFile[];
  activePath: string | null;
  history: string[];
  historyIndex: number;
  theme: "light" | "dark";
  searchQuery: string;
  searchHits: SearchHit[];
  searching: boolean;
  sidebarView: "files" | "search" | "missions";
  sidebarOpen: boolean;
  missions: Mission[];
  lastObjectivesClearedAt: number | null;
  rightSidebarView: RightSidebarView;
  rightSidebarOpen: boolean;
  backlinks: Backlink[];
  backlinksLoading: boolean;
  backlinksTarget: string | null;
  linkGraph: LinkGraph | null;
  linkGraphLoading: boolean;
  llmSettings: LLMSettings;
  settingsOpen: boolean;
  aiMessages: ChatMessage[];
  aiPending: boolean;
  aiPrefill: string | null;
  imageGenStatus: { phase: "generating" | "saving" | "error"; prompt: string; message?: string } | null;
  gitStatus: Record<string, GitFileStatus>;
  savingPath: string | null;
  zenMode: boolean;
  appVersion: string;
  updateState: UpdateState;
  vectorIndex: IndexChunk[];
  indexProgress: IndexProgress | null;
  semanticQuery: string;
  semanticResults: ScoredHit[];
  semanticSearching: boolean;
  closeDirtyPath: string | null;       // path of file pending close-confirm
  recoveredOnceAt: number | null;       // timestamp when swap recovery ran (gates restoreTrees ordering)
  recentFiles: string[];                // recently opened paths, newest first, capped at 20
  workspaces: Workspace[];              // named collections of root folders
  activeWorkspaceId: string;            // currently selected workspace id
  quickOpenVisible: boolean;            // Cmd+P file switcher modal
  editorFontSize: number;               // markdown editor body font px (zoomable)
  findOpen: boolean;                     // in-document find bar (Cmd+F)

  addFolder: () => Promise<void>;
  removeFolder: (rootPath: string) => void;
  refreshTree: (rootPath: string) => Promise<void>;
  refreshAllTrees: () => Promise<void>;
  restoreTrees: () => Promise<void>;
  reloadCleanOpenFiles: () => Promise<void>;
  /** Set of file paths that were modified externally while dirty in the
   *  editor. Surfaces a banner the user can act on (reload disk / keep
   *  local). Updated by detectExternalChanges() which runs on window focus. */
  externalChangedPaths: string[];
  detectExternalChanges: () => Promise<void>;
  resolveExternalChange: (path: string, action: "reload" | "keep") => Promise<void>;
  toggleExpand: (path: string) => void;
  openFile: (path: string, name: string) => Promise<void>;
  closeFile: (path: string) => void;
  reorderTabs: (fromIdx: number, toIdx: number) => void;
  reorderMissions: (fromIdx: number, toIdx: number) => void;
  setEditorFontSize: (px: number) => void;
  bumpEditorFontSize: (delta: number) => void;
  resetEditorFontSize: () => void;
  setFindOpen: (v: boolean) => void;
  createWorkspace: (name: string) => Promise<void>;
  switchWorkspace: (id: string) => Promise<void>;
  renameWorkspace: (id: string, name: string) => void;
  deleteWorkspace: (id: string) => Promise<void>;
  requestCloseFile: (path: string) => void;     // dirty-aware close (prompts on dirty)
  setCloseDirtyPath: (path: string | null) => void;
  setQuickOpenVisible: (v: boolean) => void;
  setContent: (path: string, content: string) => void;
  saveFile: (path: string) => Promise<void>;
  saveActive: () => Promise<void>;
  saveAllDirty: () => Promise<void>;
  recoverSwaps: () => Promise<void>;
  setActive: (path: string) => void;
  collapseAll: () => void;
  navBack: () => void;
  navForward: () => void;
  createFile: (parentDir: string, name: string) => Promise<void>;
  createFolder: (parentDir: string, name: string) => Promise<void>;
  deletePath: (path: string, isDir: boolean) => Promise<void>;
  renamePath: (oldPath: string, newName: string) => Promise<void>;
  movePath: (srcPath: string, destDir: string) => Promise<void>;
  toggleTheme: () => void;
  setSearchQuery: (q: string) => void;
  runSearch: () => Promise<void>;
  setSidebarView: (v: "files" | "search" | "missions") => void;
  addMission: (title: string, priority?: MissionPriority, deadline?: number | null) => void;
  toggleMission: (id: string) => void;
  deleteMission: (id: string) => void;
  updateMission: (id: string, patch: Partial<Mission>) => void;
  clearObjectivesFlash: () => void;
  toggleSidebar: () => void;
  setRightSidebarView: (v: RightSidebarView) => void;
  toggleRightSidebar: () => void;
  loadBacklinks: (target: string) => Promise<void>;
  loadLinkGraph: () => Promise<void>;
  updateLLMSettings: (s: Partial<LLMSettings>) => void;
  setSettingsOpen: (v: boolean) => void;
  appendAiMessage: (m: ChatMessage) => void;
  updateLastAiMessage: (patch: (prev: string) => string) => void;
  clearAiMessages: () => void;
  setAiPending: (v: boolean) => void;
  setAiPrefill: (s: string | null) => void;
  setImageGenStatus: (s: State["imageGenStatus"]) => void;
  loadGitStatus: () => Promise<void>;
  toggleZenMode: () => void;
  setAppVersion: (v: string) => void;
  setUpdateState: (s: UpdateState) => void;
  rebuildVectorIndex: (mode?: "full" | "incremental") => Promise<void>;
  previewIndexDiff: () => Promise<{ toReindex: number; removed: number; kept: number; total: number }>;
  clearVectorIndex: () => Promise<void>;
  loadVectorIndex: () => Promise<void>;
  setSemanticQuery: (q: string) => void;
  runSemanticSearch: (excludeCurrentFile?: boolean) => Promise<void>;
  openWikilink: (name: string) => Promise<void>;
}

function dirname(p: string): string {
  const i = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
  return i >= 0 ? p.slice(0, i) : p;
}
function basename(p: string): string {
  const i = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
  return i >= 0 ? p.slice(i + 1) : p;
}
function joinPath(a: string, b: string): string {
  const sep = a.includes("\\") && !a.includes("/") ? "\\" : "/";
  return a.endsWith("/") || a.endsWith("\\") ? a + b : a + sep + b;
}
function rootOf(roots: string[], p: string): string | null {
  for (const r of roots) {
    if (p === r) return r;
    if (p.startsWith(r + "/") || p.startsWith(r + "\\")) return r;
  }
  return null;
}

// loadRoots() removed — multi-workspace flow loads via loadWorkspaces().
// The legacy "roots" localStorage key is still mirrored by saveRoots() for
// any external tooling that might read it.
function saveRoots(roots: string[]) {
  // Legacy single-roots key kept for back-compat (other tools might read it)
  localStorage.setItem("roots", JSON.stringify(roots));
}

/** Persist roots change into the currently active workspace */
function syncRootsToActiveWorkspace(
  workspaces: Workspace[],
  activeId: string,
  roots: string[],
): Workspace[] {
  const next = workspaces.map((w) =>
    w.id === activeId ? { ...w, roots } : w,
  );
  persistWorkspaces(next, activeId);
  return next;
}

const MISSIONS_KEY = "missions:v1";
function loadMissions(): Mission[] {
  try {
    const raw = localStorage.getItem(MISSIONS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
function persistMissions(missions: Mission[]) {
  try {
    localStorage.setItem(MISSIONS_KEY, JSON.stringify(missions));
  } catch {}
}

// ─── Workspaces ─────────────────────────────────────────────
// Multi-vault support: each workspace has its own list of root folders.
// Migration: legacy users had a single flat roots[] in localStorage — on first
// load we wrap it into a "默认" workspace.
const WORKSPACES_KEY = "workspaces:v1";
const ACTIVE_WORKSPACE_KEY = "activeWorkspace:v1";

function genId(): string {
  return "w_" + Math.random().toString(36).slice(2, 10);
}

function loadWorkspaces(): { workspaces: Workspace[]; activeId: string } {
  try {
    const raw = localStorage.getItem(WORKSPACES_KEY);
    const activeId = localStorage.getItem(ACTIVE_WORKSPACE_KEY) || "";
    if (raw) {
      const parsed = JSON.parse(raw) as Workspace[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        const valid = activeId && parsed.some((w) => w.id === activeId) ? activeId : parsed[0].id;
        return { workspaces: parsed, activeId: valid };
      }
    }
  } catch {
    /* fall through to migration */
  }
  // Migrate: read legacy roots[] from localStorage and wrap as "默认"
  let legacyRoots: string[] = [];
  try {
    const raw = localStorage.getItem("roots");
    if (raw) legacyRoots = JSON.parse(raw);
  } catch {
    /* */
  }
  const ws: Workspace = {
    id: genId(),
    name: "默认",
    roots: Array.isArray(legacyRoots) ? legacyRoots : [],
    createdAt: Date.now(),
  };
  localStorage.setItem(WORKSPACES_KEY, JSON.stringify([ws]));
  localStorage.setItem(ACTIVE_WORKSPACE_KEY, ws.id);
  return { workspaces: [ws], activeId: ws.id };
}

function persistWorkspaces(workspaces: Workspace[], activeId: string) {
  try {
    localStorage.setItem(WORKSPACES_KEY, JSON.stringify(workspaces));
    localStorage.setItem(ACTIVE_WORKSPACE_KEY, activeId);
  } catch {
    /* */
  }
}

const RECENT_FILES_KEY = "recentFiles:v1";
const RECENT_FILES_MAX = 20;

// ─── Editor font size ───────────────────────────────────────
const FONT_SIZE_KEY = "editorFontSize:v1";
const FONT_SIZE_DEFAULT = 15;
const FONT_SIZE_MIN = 11;
const FONT_SIZE_MAX = 28;

function loadFontSize(): number {
  const raw = Number(localStorage.getItem(FONT_SIZE_KEY));
  if (Number.isFinite(raw) && raw >= FONT_SIZE_MIN && raw <= FONT_SIZE_MAX) return raw;
  return FONT_SIZE_DEFAULT;
}
function applyFontSize(px: number) {
  document.documentElement.style.setProperty("--editor-font-size", `${px}px`);
}
function clampFontSize(px: number): number {
  return Math.max(FONT_SIZE_MIN, Math.min(FONT_SIZE_MAX, Math.round(px)));
}
function loadRecentFiles(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_FILES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((p) => typeof p === "string").slice(0, RECENT_FILES_MAX) : [];
  } catch {
    return [];
  }
}
function persistRecentFiles(list: string[]) {
  try {
    localStorage.setItem(RECENT_FILES_KEY, JSON.stringify(list));
  } catch {}
}

// Derive roots from active workspace (overrides legacy loadRoots() flow)
const __initWs = loadWorkspaces();
const __initRoots = __initWs.workspaces.find((w) => w.id === __initWs.activeId)?.roots ?? [];

export const useStore = create<State>((set, get) => ({
  roots: __initRoots,
  trees: {},
  expanded: new Set<string>(__initRoots),
  openFiles: [],
  activePath: null,
  history: [],
  historyIndex: -1,
  theme: (localStorage.getItem("theme") as "light" | "dark") || "dark",
  searchQuery: "",
  searchHits: [],
  searching: false,
  sidebarView: (localStorage.getItem("sidebarView") as "files" | "search" | "missions") || "files",
  sidebarOpen: (localStorage.getItem("sidebarOpen") ?? "1") !== "0",
  missions: loadMissions(),
  lastObjectivesClearedAt: null,
  rightSidebarView: (localStorage.getItem("rightSidebarView") as RightSidebarView) || "outline",
  rightSidebarOpen: (localStorage.getItem("rightSidebarOpen") ?? "1") !== "0",
  backlinks: [],
  backlinksLoading: false,
  backlinksTarget: null,
  linkGraph: null,
  linkGraphLoading: false,
  llmSettings: loadLLMSettings(),
  settingsOpen: false,
  aiMessages: [],
  aiPending: false,
  aiPrefill: null,
  imageGenStatus: null,
  gitStatus: {},
  savingPath: null,
  zenMode: false,
  appVersion: "0.0.0",
  updateState: { kind: "idle" },
  vectorIndex: [],
  indexProgress: null,
  semanticQuery: "",
  semanticResults: [],
  semanticSearching: false,
  closeDirtyPath: null,
  recoveredOnceAt: null,
  recentFiles: loadRecentFiles(),
  externalChangedPaths: [],
  editorFontSize: loadFontSize(),
  findOpen: false,
  ...(() => {
    const { workspaces, activeId } = loadWorkspaces();
    return { workspaces, activeWorkspaceId: activeId };
  })(),
  quickOpenVisible: false,

  addFolder: async () => {
    const picked = await open({ directory: true, multiple: false });
    if (typeof picked !== "string") return;
    const { roots, expanded, workspaces, activeWorkspaceId } = get();
    if (roots.includes(picked)) return;
    const newRoots = [...roots, picked];
    const newExp = new Set(expanded);
    newExp.add(picked);
    const nextWs = syncRootsToActiveWorkspace(workspaces, activeWorkspaceId, newRoots);
    set({ roots: newRoots, expanded: newExp, workspaces: nextWs });
    saveRoots(newRoots);
    await get().refreshTree(picked);
  },

  removeFolder: (rootPath) => {
    const { roots, trees, expanded, workspaces, activeWorkspaceId } = get();
    const newRoots = roots.filter((r) => r !== rootPath);
    const newTrees = { ...trees };
    delete newTrees[rootPath];
    const newExp = new Set(
      [...expanded].filter((p) => p !== rootPath && !p.startsWith(rootPath + "/") && !p.startsWith(rootPath + "\\")),
    );
    const nextWs = syncRootsToActiveWorkspace(workspaces, activeWorkspaceId, newRoots);
    set({ roots: newRoots, trees: newTrees, expanded: newExp, workspaces: nextWs });
    saveRoots(newRoots);
  },

  refreshTree: async (rootPath) => {
    try {
      const tree = await invoke<FileNode>("read_dir_tree", { path: rootPath });
      set({ trees: { ...get().trees, [rootPath]: tree } });
    } catch (e) {
      console.error("refreshTree failed", rootPath, e);
    }
  },

  refreshAllTrees: async () => {
    await Promise.all(get().roots.map((r) => get().refreshTree(r)));
    await get().reloadCleanOpenFiles();
    await get().loadGitStatus();
  },

  restoreTrees: async () => {
    await Promise.all(get().roots.map((r) => get().refreshTree(r)));
    get().loadGitStatus().catch(() => {});
  },

  reloadCleanOpenFiles: async () => {
    // For each open file that is NOT dirty, re-read from disk and update
    // content if it changed externally. Skip dirty files to avoid clobbering
    // unsaved edits.
    const files = get().openFiles;
    const updates: Record<string, string> = {};
    const externallyChangedDirty: string[] = [];
    await Promise.all(
      files.map(async (f) => {
        try {
          const fresh = await readTextFile(f.path);
          const dirty = f.content !== f.savedContent;
          if (dirty) {
            // Dirty + disk changed → external conflict, surface banner
            if (fresh !== f.savedContent) externallyChangedDirty.push(f.path);
          } else if (fresh !== f.savedContent) {
            updates[f.path] = fresh;
          }
        } catch {
          // file may have been deleted externally — keep in tab, user decides
        }
      }),
    );
    if (externallyChangedDirty.length) {
      // Merge into externalChangedPaths (dedup)
      const current = new Set(get().externalChangedPaths);
      externallyChangedDirty.forEach((p) => current.add(p));
      set({ externalChangedPaths: Array.from(current) });
    }
    if (Object.keys(updates).length) {
      const next = get().openFiles.map((f) =>
        updates[f.path] !== undefined
          ? { ...f, content: updates[f.path], savedContent: updates[f.path] }
          : f,
      );
      set({ openFiles: next });
    }
  },

  toggleExpand: (path) => {
    const next = new Set(get().expanded);
    if (next.has(path)) next.delete(path);
    else next.add(path);
    set({ expanded: next });
  },

  openFile: async (path, name) => {
    // Track recents (newest first, deduped, capped)
    const recents = [path, ...get().recentFiles.filter((p) => p !== path)].slice(0, RECENT_FILES_MAX);
    set({ recentFiles: recents });
    persistRecentFiles(recents);

    const existing = get().openFiles.find((f) => f.path === path);
    if (existing) {
      get().setActive(path);
      return;
    }
    try {
      const content = await readTextFile(path);
      const f: OpenFile = {
        path,
        name,
        content,
        savedContent: content,
        kind: detectKind(name),
      };
      set({ openFiles: [...get().openFiles, f] });
      get().setActive(path);
    } catch (e) {
      console.error("Failed to open file", e);
    }
  },

  closeFile: (path) => {
    // Cancel pending auto-save + swap timers, and remove any existing swap.
    // Caller is responsible for prompting the user about unsaved content
    // BEFORE calling closeFile — by the time we get here, the user has
    // confirmed they want to discard (or there's nothing dirty).
    cancelAutosave(path);
    cancelSwap(path);
    deleteSwap(path).catch(() => {});

    const files = get().openFiles.filter((f) => f.path !== path);
    // Strip from history; collapse consecutive duplicates after filtering
    let history = get().history.filter((p) => p !== path);
    history = history.filter((p, i, arr) => i === 0 || arr[i - 1] !== p);
    const historyIndex = Math.min(get().historyIndex, history.length - 1);

    let active = get().activePath;
    if (active === path) {
      active = history.length ? history[historyIndex] : files[files.length - 1]?.path ?? null;
    }
    set({ openFiles: files, activePath: active, history, historyIndex });
  },

  reorderTabs: (fromIdx, toIdx) => {
    const files = get().openFiles.slice();
    if (fromIdx < 0 || fromIdx >= files.length || toIdx < 0 || toIdx >= files.length) return;
    const [moved] = files.splice(fromIdx, 1);
    files.splice(toIdx, 0, moved);
    set({ openFiles: files });
  },

  reorderMissions: (fromIdx, toIdx) => {
    const missions = get().missions.slice();
    if (fromIdx < 0 || fromIdx >= missions.length || toIdx < 0 || toIdx >= missions.length) return;
    const [moved] = missions.splice(fromIdx, 1);
    missions.splice(toIdx, 0, moved);
    set({ missions });
    persistMissions(missions);
  },

  setEditorFontSize: (px) => {
    const v = clampFontSize(px);
    applyFontSize(v);
    localStorage.setItem(FONT_SIZE_KEY, String(v));
    set({ editorFontSize: v });
  },
  bumpEditorFontSize: (delta) => {
    const v = clampFontSize(get().editorFontSize + delta);
    applyFontSize(v);
    localStorage.setItem(FONT_SIZE_KEY, String(v));
    set({ editorFontSize: v });
  },
  resetEditorFontSize: () => {
    applyFontSize(FONT_SIZE_DEFAULT);
    localStorage.setItem(FONT_SIZE_KEY, String(FONT_SIZE_DEFAULT));
    set({ editorFontSize: FONT_SIZE_DEFAULT });
  },
  setFindOpen: (v) => set({ findOpen: v }),

  // ─── Workspaces ─────────────────────────────────────────────
  createWorkspace: async (name) => {
    const trimmed = name.trim() || `工作区 ${get().workspaces.length + 1}`;
    const ws: Workspace = {
      id: genId(),
      name: trimmed,
      roots: [],
      createdAt: Date.now(),
    };
    const next = [...get().workspaces, ws];
    persistWorkspaces(next, ws.id);
    // Save outgoing workspace state implicitly (no dirty save — we flush below)
    window.dispatchEvent(new Event("markflow:flush-editor"));
    flushAllAutosaves();
    await get().saveAllDirty();
    // Switch into the new workspace
    set({
      workspaces: next,
      activeWorkspaceId: ws.id,
      roots: [],
      trees: {},
      expanded: new Set<string>(),
      openFiles: [],
      activePath: null,
      history: [],
      historyIndex: -1,
    });
    saveRoots([]);
  },

  switchWorkspace: async (id) => {
    const target = get().workspaces.find((w) => w.id === id);
    if (!target || id === get().activeWorkspaceId) return;
    // Flush + save outgoing dirty buffers before swapping
    window.dispatchEvent(new Event("markflow:flush-editor"));
    flushAllAutosaves();
    await get().saveAllDirty();
    persistWorkspaces(get().workspaces, target.id);
    set({
      activeWorkspaceId: target.id,
      roots: target.roots,
      trees: {},
      expanded: new Set<string>(target.roots),
      openFiles: [],
      activePath: null,
      history: [],
      historyIndex: -1,
    });
    saveRoots(target.roots);
    // Refresh trees for the new workspace
    await get().refreshAllTrees();
  },

  renameWorkspace: (id, name) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const next = get().workspaces.map((w) => (w.id === id ? { ...w, name: trimmed } : w));
    persistWorkspaces(next, get().activeWorkspaceId);
    set({ workspaces: next });
  },

  deleteWorkspace: async (id) => {
    const all = get().workspaces;
    if (all.length <= 1) return;                       // refuse to delete the last one
    const remaining = all.filter((w) => w.id !== id);
    const wasActive = get().activeWorkspaceId === id;
    if (wasActive) {
      // Switch to the first remaining workspace
      const target = remaining[0];
      persistWorkspaces(remaining, target.id);
      set({
        workspaces: remaining,
        activeWorkspaceId: target.id,
        roots: target.roots,
        trees: {},
        expanded: new Set<string>(target.roots),
        openFiles: [],
        activePath: null,
        history: [],
        historyIndex: -1,
      });
      saveRoots(target.roots);
      await get().refreshAllTrees();
    } else {
      persistWorkspaces(remaining, get().activeWorkspaceId);
      set({ workspaces: remaining });
    }
  },

  setContent: (path, content) => {
    const files = get().openFiles.map((f) =>
      f.path === path ? { ...f, content } : f,
    );
    set({ openFiles: files });

    // Auto-save 1s after last edit; swap snapshot 5s after last edit.
    // Both no-op cheaply when content === savedContent (saveFile early-returns).
    const f = files.find((x) => x.path === path);
    if (f && f.content !== f.savedContent) {
      scheduleAutosave(path);
      scheduleSwap(path, () => {
        // Read fresh from store at the moment the timer fires — handles the
        // case where the user kept typing between schedule and fire.
        const cur = useStore.getState().openFiles.find((x) => x.path === path);
        return cur && cur.content !== cur.savedContent ? cur.content : null;
      });
    }
  },

  saveFile: async (path) => {
    const f = get().openFiles.find((x) => x.path === path);
    if (!f) return;
    if (f.content === f.savedContent) return;
    await writeTextFile(path, f.content);
    const files = get().openFiles.map((x) =>
      x.path === path ? { ...x, savedContent: x.content } : x,
    );
    set({ openFiles: files, savingPath: path });
    // Once successfully persisted, the swap is no longer needed — drop it.
    cancelAutosave(path);
    cancelSwap(path);
    deleteSwap(path).catch(() => {});
    // Clear beam state after the CSS animation finishes (matches .saving-beam: 700ms)
    setTimeout(() => {
      if (get().savingPath === path) set({ savingPath: null });
    }, 750);
    // Refresh git status (debounce-ish — fire-and-forget)
    get().loadGitStatus().catch(() => {});
  },

  saveActive: async () => {
    const p = get().activePath;
    if (p) await get().saveFile(p);
  },

  saveAllDirty: async () => {
    const dirty = get().openFiles.filter((f) => f.content !== f.savedContent);
    await Promise.all(dirty.map((f) => get().saveFile(f.path).catch(() => {})));
  },

  /** Check if any open files were modified externally since the editor's
   *  last known savedContent. Designed to run on window focus.
   *  - Clean tabs with changed disk → silently updated
   *  - Dirty tabs with changed disk → surfaced via externalChangedPaths
   */
  detectExternalChanges: async () => {
    // reloadCleanOpenFiles already does both: silent update for clean,
    // adds to externalChangedPaths for dirty. Just delegate.
    await get().reloadCleanOpenFiles();
  },

  /** User picked an action on an externally-modified-while-dirty file. */
  resolveExternalChange: async (path, action) => {
    if (action === "reload") {
      // Discard local edits, load fresh from disk
      try {
        const fresh = await readTextFile(path);
        const files = get().openFiles.map((f) =>
          f.path === path ? { ...f, content: fresh, savedContent: fresh } : f,
        );
        set({ openFiles: files });
      } catch (e) {
        console.warn("[resolveExternalChange] reload failed", e);
      }
    }
    // For "keep": leave content alone; the user will hit Cmd+S → overwrites disk
    const remaining = get().externalChangedPaths.filter((p) => p !== path);
    set({ externalChangedPaths: remaining });
  },

  requestCloseFile: (path) => {
    const f = get().openFiles.find((x) => x.path === path);
    if (!f) return;
    if (f.content !== f.savedContent) {
      // Defer the actual close to user choice in the modal
      set({ closeDirtyPath: path });
    } else {
      get().closeFile(path);
    }
  },

  setCloseDirtyPath: (path) => set({ closeDirtyPath: path }),
  setQuickOpenVisible: (v) => set({ quickOpenVisible: v }),

  recoverSwaps: async () => {
    if (get().recoveredOnceAt) return;        // run at most once per session
    set({ recoveredOnceAt: Date.now() });
    const swaps = await loadAllSwaps();
    if (!swaps.length) return;
    // For each recovered entry, open the original path (loads disk content
    // as savedContent baseline) then overlay the swap content as the live
    // dirty buffer. User can save (writes recovered content, deletes swap)
    // or close (keeps swap for next launch — discard only via explicit save).
    for (const swap of swaps) {
      try {
        const name = swap.originalPath.split(/[\\/]/).pop() || swap.originalPath;
        // Read disk for the savedContent baseline. If disk read fails,
        // treat swap content as both saved and current — file may have been
        // deleted externally; user can save it back.
        let savedBaseline: string;
        try {
          savedBaseline = await readTextFile(swap.originalPath);
        } catch {
          savedBaseline = swap.content;
        }
        // If swap matches disk, the swap is stale (user saved via another
        // means since last swap write). Just delete it and skip.
        if (savedBaseline === swap.content) {
          await deleteSwap(swap.originalPath);
          continue;
        }
        const existing = get().openFiles.find((f) => f.path === swap.originalPath);
        if (existing) {
          // Already open (unusual — startup races). Overlay swap content.
          set({
            openFiles: get().openFiles.map((f) =>
              f.path === swap.originalPath
                ? { ...f, content: swap.content, savedContent: savedBaseline }
                : f,
            ),
          });
        } else {
          const f: OpenFile = {
            path: swap.originalPath,
            name,
            content: swap.content,
            savedContent: savedBaseline,
            kind: detectKind(name),
          };
          set({ openFiles: [...get().openFiles, f] });
        }
      } catch (e) {
        console.warn("[recoverSwaps] entry failed", swap.originalPath, e);
      }
    }
  },

  setActive: (path) => {
    if (get().activePath === path) {
      set({ activePath: path });
      return;
    }
    // Truncate forward history, then append current path
    const { history, historyIndex } = get();
    const truncated = history.slice(0, historyIndex + 1);
    if (truncated[truncated.length - 1] !== path) truncated.push(path);
    set({ activePath: path, history: truncated, historyIndex: truncated.length - 1 });
  },

  collapseAll: () => {
    // Keep roots themselves expanded (so workspace sections stay open),
    // collapse all nested folder paths
    const roots = get().roots;
    set({ expanded: new Set(roots) });
  },

  navBack: () => {
    const { history, historyIndex } = get();
    if (historyIndex <= 0) return;
    const target = history[historyIndex - 1];
    set({ historyIndex: historyIndex - 1, activePath: target });
  },

  navForward: () => {
    const { history, historyIndex } = get();
    if (historyIndex >= history.length - 1) return;
    const target = history[historyIndex + 1];
    set({ historyIndex: historyIndex + 1, activePath: target });
  },

  createFile: async (parentDir, name) => {
    const newPath = joinPath(parentDir, name);
    await writeTextFile(newPath, "");
    const root = rootOf(get().roots, parentDir);
    if (root) await get().refreshTree(root);
    await get().openFile(newPath, name);
  },

  createFolder: async (parentDir, name) => {
    const newPath = joinPath(parentDir, name);
    await mkdir(newPath, { recursive: true });
    const root = rootOf(get().roots, parentDir);
    if (root) await get().refreshTree(root);
  },

  deletePath: async (path, isDir) => {
    await remove(path, { recursive: isDir });
    if (!isDir) {
      const files = get().openFiles.filter((f) => f.path !== path);
      let active = get().activePath;
      if (active === path) active = files[0]?.path ?? null;
      set({ openFiles: files, activePath: active });
    }
    const root = rootOf(get().roots, path);
    if (root) await get().refreshTree(root);
  },

  renamePath: async (oldPath, newName) => {
    const parent = dirname(oldPath);
    const newPath = joinPath(parent, newName);
    await rename(oldPath, newPath);
    const files = get().openFiles.map((f) =>
      f.path === oldPath ? { ...f, path: newPath, name: newName, kind: detectKind(newName) } : f,
    );
    const active = get().activePath === oldPath ? newPath : get().activePath;
    set({ openFiles: files, activePath: active });
    const root = rootOf(get().roots, parent);
    if (root) await get().refreshTree(root);
  },

  /** Move a file or folder into a target directory.
   *  Guards: no-op when src parent == destDir, no-op when destDir is inside src
   *  (would create a cycle), no-op when destination already has same-name child. */
  movePath: async (srcPath, destDir) => {
    const parent = dirname(srcPath);
    if (parent === destDir) return;                                  // already there
    if (destDir === srcPath || destDir.startsWith(srcPath + "/") ||
        destDir.startsWith(srcPath + "\\")) {
      console.warn("[movePath] refused: dest is inside source");
      return;
    }
    const name = srcPath.split(/[\\/]/).pop() || srcPath;
    const newPath = joinPath(destDir, name);
    try {
      await rename(srcPath, newPath);
    } catch (e) {
      console.warn("[movePath] rename failed", e);
      return;
    }
    // Update open files referencing the moved path (handles both file and
    // folder moves — anything inside a moved folder gets its prefix swapped).
    const remap = (p: string) =>
      p === srcPath || p.startsWith(srcPath + "/") || p.startsWith(srcPath + "\\")
        ? newPath + p.slice(srcPath.length)
        : p;
    const files = get().openFiles.map((f) => {
      const np = remap(f.path);
      return np === f.path ? f : { ...f, path: np };
    });
    const active = get().activePath ? remap(get().activePath!) : null;
    set({ openFiles: files, activePath: active });
    // Refresh both source-side and dest-side trees (may be same root)
    const srcRoot = rootOf(get().roots, parent);
    const destRoot = rootOf(get().roots, destDir);
    if (srcRoot) await get().refreshTree(srcRoot);
    if (destRoot && destRoot !== srcRoot) await get().refreshTree(destRoot);
  },

  toggleTheme: () => {
    const t = get().theme === "light" ? "dark" : "light";
    localStorage.setItem("theme", t);
    document.documentElement.classList.toggle("dark", t === "dark");
    set({ theme: t });
  },

  setSearchQuery: (q) => set({ searchQuery: q }),

  runSearch: async () => {
    const { roots, searchQuery } = get();
    if (!roots.length || !searchQuery.trim()) {
      set({ searchHits: [] });
      return;
    }
    set({ searching: true });
    try {
      const all: SearchHit[] = [];
      for (const root of roots) {
        try {
          const hits = await invoke<SearchHit[]>("search_text", {
            root,
            query: searchQuery,
          });
          all.push(...hits);
        } catch (e) {
          console.error("search failed for", root, e);
        }
      }
      set({ searchHits: all });
    } finally {
      set({ searching: false });
    }
  },

  setSidebarView: (v) => {
    set({ sidebarView: v, sidebarOpen: true });
    localStorage.setItem("sidebarOpen", "1");
    localStorage.setItem("sidebarView", v);
  },

  addMission: (title, priority = "mid", deadline = null) => {
    const m: Mission = {
      id: Math.random().toString(36).slice(2, 11),
      title: title.trim(),
      priority,
      deadline,
      completed: false,
      completedAt: null,
      createdAt: Date.now(),
    };
    const next = [m, ...get().missions];
    set({ missions: next });
    persistMissions(next);
  },

  toggleMission: (id) => {
    const prevAllDone = get().missions.length > 0 && get().missions.every((m) => m.completed);
    const next = get().missions.map((m) =>
      m.id === id
        ? { ...m, completed: !m.completed, completedAt: !m.completed ? Date.now() : null }
        : m,
    );
    const newAllDone = next.length > 0 && next.every((m) => m.completed);
    set({
      missions: next,
      lastObjectivesClearedAt: !prevAllDone && newAllDone ? Date.now() : get().lastObjectivesClearedAt,
    });
    persistMissions(next);
  },

  deleteMission: (id) => {
    const next = get().missions.filter((m) => m.id !== id);
    set({ missions: next });
    persistMissions(next);
  },

  updateMission: (id, patch) => {
    const next = get().missions.map((m) => (m.id === id ? { ...m, ...patch } : m));
    set({ missions: next });
    persistMissions(next);
  },

  clearObjectivesFlash: () => set({ lastObjectivesClearedAt: null }),

  toggleSidebar: () => {
    const next = !get().sidebarOpen;
    set({ sidebarOpen: next });
    localStorage.setItem("sidebarOpen", next ? "1" : "0");
  },

  setRightSidebarView: (v) => {
    set({ rightSidebarView: v, rightSidebarOpen: true });
    localStorage.setItem("rightSidebarOpen", "1");
    localStorage.setItem("rightSidebarView", v);
  },

  toggleRightSidebar: () => {
    const next = !get().rightSidebarOpen;
    set({ rightSidebarOpen: next });
    localStorage.setItem("rightSidebarOpen", next ? "1" : "0");
  },

  loadBacklinks: async (target) => {
    const { roots } = get();
    if (!roots.length) {
      set({ backlinks: [], backlinksTarget: target, backlinksLoading: false });
      return;
    }
    set({ backlinksLoading: true, backlinksTarget: target });
    try {
      const hits = await invoke<Backlink[]>("get_backlinks", { roots, target });
      if (get().backlinksTarget !== target) return; // user switched again
      set({ backlinks: hits, backlinksLoading: false });
    } catch (e) {
      console.error("loadBacklinks failed", e);
      set({ backlinks: [], backlinksLoading: false });
    }
  },

  loadLinkGraph: async () => {
    const { roots } = get();
    if (!roots.length) {
      set({ linkGraph: { nodes: [], edges: [] }, linkGraphLoading: false });
      return;
    }
    set({ linkGraphLoading: true });
    try {
      const g = await invoke<LinkGraph>("get_link_graph", { roots });
      set({ linkGraph: g, linkGraphLoading: false });
    } catch (e) {
      console.error("loadLinkGraph failed", e);
      set({ linkGraph: { nodes: [], edges: [] }, linkGraphLoading: false });
    }
  },

  updateLLMSettings: (patch) => {
    const next = { ...get().llmSettings, ...patch };
    set({ llmSettings: next });
    saveLLMSettings(next);
  },

  setSettingsOpen: (v) => set({ settingsOpen: v }),

  appendAiMessage: (m) => set({ aiMessages: [...get().aiMessages, m] }),

  updateLastAiMessage: (patch) => {
    const msgs = get().aiMessages;
    if (!msgs.length) return;
    const last = msgs[msgs.length - 1];
    const next = [...msgs.slice(0, -1), { ...last, content: patch(last.content) }];
    set({ aiMessages: next });
  },

  clearAiMessages: () => set({ aiMessages: [] }),

  setAiPending: (v) => set({ aiPending: v }),

  setAiPrefill: (s) => set({ aiPrefill: s }),

  setImageGenStatus: (s) => set({ imageGenStatus: s }),

  toggleZenMode: () => set({ zenMode: !get().zenMode }),

  setAppVersion: (v) => set({ appVersion: v }),

  setUpdateState: (s) => set({ updateState: s }),

  loadGitStatus: async () => {
    const { roots } = get();
    if (!roots.length) {
      set({ gitStatus: {} });
      return;
    }
    try {
      const map = await invoke<Record<string, GitFileStatus>>("git_status", { roots });
      set({ gitStatus: map });
    } catch (e) {
      // Silently ignore — roots may not be git repos
      set({ gitStatus: {} });
    }
  },

  rebuildVectorIndex: async (mode = "incremental") => {
    const { roots, llmSettings, vectorIndex } = get();
    if (!llmSettings.embedModel) {
      throw new Error("未配置嵌入模型，请先在设置中配置");
    }
    if (roots.length === 0) {
      set({ vectorIndex: [], indexProgress: null });
      return;
    }
    let metas: MdFileMeta[];
    try {
      metas = await invoke<MdFileMeta[]>("list_md_files_meta", { roots });
    } catch (e) {
      console.error("list_md_files_meta failed", e);
      throw e;
    }
    try {
      const chunks =
        mode === "full"
          ? await rebuildIndexFull(metas, llmSettings, (p) => set({ indexProgress: p }))
          : await rebuildIndexIncremental(metas, vectorIndex, llmSettings, (p) =>
              set({ indexProgress: p }),
            );
      set({ vectorIndex: chunks, indexProgress: null });
    } catch (e) {
      console.error("rebuildVectorIndex failed", e);
      set({ indexProgress: null });
      throw e;
    }
  },

  previewIndexDiff: async () => {
    const { roots, vectorIndex } = get();
    if (roots.length === 0) {
      return { toReindex: 0, removed: 0, kept: 0, total: 0 };
    }
    const metas = await invoke<MdFileMeta[]>("list_md_files_meta", { roots });
    const diff = diffIndex(vectorIndex, metas);
    return {
      toReindex: diff.toReindex.length,
      removed: diff.removed.length,
      kept: diff.kept,
      total: metas.length,
    };
  },

  clearVectorIndex: async () => {
    await clearIndex();
    set({ vectorIndex: [], semanticResults: [] });
  },

  loadVectorIndex: async () => {
    try {
      const idx = await loadIndex();
      set({ vectorIndex: idx });
    } catch (e) {
      console.warn("loadVectorIndex failed", e);
    }
  },

  setSemanticQuery: (q) => set({ semanticQuery: q }),

  openWikilink: async (name) => {
    const { trees, openFile } = get();
    const target = name.replace(/\.md$/i, "").trim();
    if (!target) return;
    const targetLower = target.toLowerCase();
    const search = (node: FileNode): { path: string; name: string } | null => {
      if (!node.is_dir) {
        const lower = node.name.toLowerCase();
        if (lower.endsWith(".md") || lower.endsWith(".markdown")) {
          const stem = node.name.replace(/\.(md|markdown)$/i, "");
          if (
            stem === target ||
            stem.toLowerCase() === targetLower ||
            node.name === target ||
            node.name === `${target}.md`
          ) {
            return { path: node.path, name: node.name };
          }
        }
        return null;
      }
      if (node.children) {
        for (const c of node.children) {
          const hit = search(c);
          if (hit) return hit;
        }
      }
      return null;
    };
    let found: { path: string; name: string } | null = null;
    for (const t of Object.values(trees)) {
      found = search(t);
      if (found) break;
    }
    if (found) {
      await openFile(found.path, found.name);
    }
  },

  runSemanticSearch: async (excludeCurrentFile) => {
    const { vectorIndex, semanticQuery, llmSettings, activePath } = get();
    const q = semanticQuery.trim();
    if (!q || vectorIndex.length === 0 || !llmSettings.embedModel) {
      set({ semanticResults: [] });
      return;
    }
    set({ semanticSearching: true });
    try {
      const [qVec] = await embed(llmSettings, [q]);
      const exclude = excludeCurrentFile && activePath ? activePath : undefined;
      const hits = searchVec(vectorIndex, qVec, 10, exclude);
      set({ semanticResults: hits, semanticSearching: false });
    } catch (e) {
      console.error("runSemanticSearch failed", e);
      set({ semanticSearching: false });
    }
  },
}));

export { basename, dirname, rootOf };
