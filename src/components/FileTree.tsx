import { useState } from "react";
import {
  ChevronRight,
  ChevronDown,
  FolderOpen,
  FileText,
  FilePlus,
  FolderPlus,
  RefreshCw,
  X,
  Plus,
  ChevronsDownUp,
  Check,
  Pencil,
  Trash2,
} from "lucide-react";
import clsx from "clsx";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type DragEndEvent,
} from "@dnd-kit/core";
import { useStore, basename } from "../store";
import type { FileNode } from "../types";
import { detectKind, isEditable } from "../utils/fileKind";


interface RowProps {
  node: FileNode;
  depth: number;
}

function FileIcon({ name }: { name: string }) {
  const kind = detectKind(name);
  const color = {
    markdown: "text-cyan-400/80",
    python: "text-amber-500/80",
    go: "text-sky-400/85",
    env: "text-emerald-500/80",
    text: "text-zinc-400/70",
    json: "text-orange-500/80",
    yaml: "text-rose-400/80",
    toml: "text-purple-400/80",
    sql: "text-cyan-500/80",
    javascript: "text-yellow-400/90",
    typescript: "text-blue-500/80",
    code: "text-blue-400/80",
    unknown: "text-zinc-400/60",
  }[kind];
  return <FileText size={13} className={color} strokeWidth={1.5} />;
}

function WireframeFolder({ open }: { open: boolean }) {
  // Geometric wireframe folder; cyan glow when expanded
  const color = open ? "var(--color-accent-2, #00ffff)" : "var(--color-text-muted)";
  const glow = open
    ? "drop-shadow(0 0 3px color-mix(in oklab, var(--color-accent-2, #00ffff) 60%, transparent))"
    : "none";
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 14 14"
      fill="none"
      stroke={color}
      strokeWidth="1.25"
      style={{ filter: glow, flexShrink: 0 }}
    >
      <path
        d={open
          ? "M1 3.5 L5 3.5 L6 4.5 L13 4.5 L12 11.5 L2 11.5 Z"
          : "M1 4 L5 4 L6 3 L13 3 L13 11 L1 11 Z"}
        strokeLinejoin="miter"
        strokeLinecap="square"
      />
    </svg>
  );
}

function GitFlag({ status }: { status: "new" | "mod" | "del" }) {
  if (status === "new") return <span className="git-flag git-flag-new" title="新增未跟踪">A</span>;
  if (status === "mod") return <span className="git-flag git-flag-mod" title="已修改未提交">M</span>;
  return <span className="git-flag git-flag-del" title="已删除">D</span>;
}

function Row({ node, depth }: RowProps) {
  const {
    expanded,
    toggleExpand,
    openFile,
    activePath,
    deletePath,
    renamePath,
    createFile,
    createFolder,
    gitStatus,
    savingPath,
  } = useStore();
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(node.name);
  const [menu, setMenu] = useState<null | { x: number; y: number }>(null);
  const open = expanded.has(node.path);
  const isActive = activePath === node.path;

  const onClick = async () => {
    if (node.is_dir) toggleExpand(node.path);
    else if (isEditable(node.name)) await openFile(node.path, node.name);
  };

  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setMenu({ x: e.clientX, y: e.clientY });
  };

  const submitRename = async () => {
    if (editName && editName !== node.name) {
      try {
        await renamePath(node.path, editName);
      } catch (err) {
        console.error(err);
      }
    }
    setEditing(false);
  };

  const fileStatus = !node.is_dir ? gitStatus[node.path] : undefined;
  const isSaving = !node.is_dir && savingPath === node.path;

  // dnd-kit — make every row draggable; folders are also droppable targets.
  // Distance threshold 8px keeps single-click open behavior intact.
  const drag = useDraggable({ id: `drag:${node.path}`, data: { path: node.path } });
  const drop = useDroppable({
    id: `drop:${node.path}`,
    data: { path: node.path, isDir: node.is_dir },
    disabled: !node.is_dir,                  // only folders accept drops
  });

  // Combine refs — drag wraps the whole row; drop overlays it (folders only)
  const setRefs = (el: HTMLDivElement | null) => {
    drag.setNodeRef(el);
    if (node.is_dir) drop.setNodeRef(el);
  };

  return (
    <>
      <div
        ref={setRefs}
        {...drag.attributes}
        {...drag.listeners}
        className={clsx(
          "scan-row group flex items-center gap-1.5 pr-2 py-[5px] cursor-pointer text-[13px] select-none rounded-md mx-1",
          fileStatus === "mod" && "row-mod",
          isActive ? "is-active" : "text-[var(--color-text)] hover:bg-[var(--color-bg-soft)]",
          drop.isOver && "row-drop-target",
          drag.isDragging && "opacity-50",
        )}
        style={{ paddingLeft: 6 + depth * 14 }}
        onClick={onClick}
        onContextMenu={onContextMenu}
      >
        {isSaving && <div className="saving-beam" />}
        {node.is_dir ? (
          <ChevronRight
            size={11}
            strokeWidth={2}
            className="text-[var(--color-text-subtle)] shrink-0 transition-transform duration-150"
            style={{ transform: open ? "rotate(90deg)" : "none" }}
          />
        ) : (
          <span className="w-3 shrink-0" />
        )}
        {node.is_dir ? (
          <WireframeFolder open={open} />
        ) : (
          <span className="file-icon shrink-0 inline-flex">
            <FileIcon name={node.name} />
          </span>
        )}
        {editing ? (
          <input
            autoFocus
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onBlur={submitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") submitRename();
              if (e.key === "Escape") setEditing(false);
            }}
            onClick={(e) => e.stopPropagation()}
            className="flex-1 bg-[var(--color-bg)] border border-[var(--color-accent)] rounded-md px-1.5 text-[12.5px] outline-none font-mono focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--color-accent)_18%,transparent)]"
          />
        ) : (
          <>
            <span className="flex-1 truncate text-[13px] tracking-tight">{node.name}</span>
            {!node.is_dir && gitStatus[node.path] && (
              <GitFlag status={gitStatus[node.path]} />
            )}
          </>
        )}
      </div>
      {menu && (
        <div
          className="fixed inset-0 z-50"
          onClick={() => setMenu(null)}
          onContextMenu={(e) => {
            e.preventDefault();
            setMenu(null);
          }}
        >
          <div
            style={{
              left: menu.x,
              top: menu.y,
              boxShadow: `
                inset 0 0 0 1px var(--glass-border),
                0 8px 24px rgba(0, 0, 0, 0.4),
                0 20px 48px rgba(0, 0, 0, 0.35)
              `,
            }}
            className="absolute bg-[var(--color-bg-soft)] rounded-xl py-1.5 text-[13px] min-w-[180px] backdrop-blur-md"
            onClick={(e) => e.stopPropagation()}
          >
            {node.is_dir && (
              <>
                <button
                  className="block w-full text-left px-3.5 py-1.5 mx-1 rounded-md hover:bg-[color-mix(in_oklab,var(--color-text)_8%,transparent)]"
                  onClick={async () => {
                    setMenu(null);
                    const name = prompt("文件名 (例: notes.md)");
                    if (name) await createFile(node.path, name);
                  }}
                >
                  新建文件
                </button>
                <button
                  className="block w-full text-left px-3.5 py-1.5 mx-1 rounded-md hover:bg-[color-mix(in_oklab,var(--color-text)_8%,transparent)]"
                  onClick={async () => {
                    setMenu(null);
                    const name = prompt("文件夹名");
                    if (name) await createFolder(node.path, name);
                  }}
                >
                  新建文件夹
                </button>
                <div className="my-1 mx-2 h-px bg-[var(--glass-border,var(--color-border))]" />
              </>
            )}
            <button
              className="block w-full text-left px-3.5 py-1.5 mx-1 rounded-md hover:bg-[color-mix(in_oklab,var(--color-text)_8%,transparent)]"
              onClick={() => {
                setMenu(null);
                setEditing(true);
              }}
            >
              重命名
            </button>
            <button
              className="block w-full text-left px-3.5 py-1.5 mx-1 rounded-md hover:bg-[color-mix(in_oklab,var(--color-danger)_12%,transparent)] text-[var(--color-danger)]"
              onClick={async () => {
                setMenu(null);
                if (confirm(`删除 ${node.name}?`)) await deletePath(node.path, node.is_dir);
              }}
            >
              删除
            </button>
          </div>
        </div>
      )}
      {node.is_dir && open && node.children && (
        <div>
          {node.children.map((c) => (
            <Row key={c.path} node={c} depth={depth + 1} />
          ))}
        </div>
      )}
    </>
  );
}

function WorkspaceSection({ rootPath }: { rootPath: string }) {
  const { trees, expanded, toggleExpand, refreshTree, removeFolder, createFile, createFolder } = useStore();
  const tree = trees[rootPath];
  const open = expanded.has(rootPath);
  const displayName = tree?.name ?? basename(rootPath);

  // Workspace root is also a droppable — drag a file onto the section
  // header to move it into the root folder.
  const drop = useDroppable({
    id: `drop:${rootPath}`,
    data: { path: rootPath, isDir: true },
  });

  return (
    <div className="mb-1">
      <div
        ref={drop.setNodeRef}
        className={clsx(
          "group flex items-center gap-1.5 px-3 py-1.5 cursor-pointer select-none hover:bg-[color-mix(in_oklab,var(--color-text)_6%,transparent)] rounded-md mx-1",
          drop.isOver && "row-drop-target",
        )}
        onClick={() => toggleExpand(rootPath)}
        title={rootPath}
      >
        <ChevronRight
          size={11}
          strokeWidth={2}
          className="text-[var(--color-text-subtle)] shrink-0 transition-transform duration-150"
          style={{ transform: open ? "rotate(90deg)" : "none" }}
        />
        <span className="text-[11px] tracking-[0.08em] text-[var(--color-accent)] uppercase font-semibold truncate flex-1">
          {displayName}
        </span>
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100">
          <button
            onClick={async (e) => {
              e.stopPropagation();
              const name = prompt("文件名 (例: notes.md)");
              if (name) await createFile(rootPath, name);
            }}
            title="新建文件"
            className="p-1 rounded hover:bg-[var(--color-bg-muted)] text-[var(--color-text-muted)]"
          >
            <FilePlus size={11} />
          </button>
          <button
            onClick={async (e) => {
              e.stopPropagation();
              const name = prompt("文件夹名");
              if (name) await createFolder(rootPath, name);
            }}
            title="新建文件夹"
            className="p-1 rounded hover:bg-[var(--color-bg-muted)] text-[var(--color-text-muted)]"
          >
            <FolderPlus size={11} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              refreshTree(rootPath);
            }}
            title="刷新"
            className="p-1 rounded hover:bg-[var(--color-bg-muted)] text-[var(--color-text-muted)]"
          >
            <RefreshCw size={11} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (confirm(`移除工作区 "${displayName}"？\n（不会删除磁盘上的文件）`)) {
                removeFolder(rootPath);
              }
            }}
            title="移除工作区"
            className="p-1 rounded hover:bg-[var(--color-bg-muted)] text-[var(--color-danger)]"
          >
            <X size={11} />
          </button>
        </div>
      </div>
      {open && (
        <div>
          {tree ? (
            tree.children?.map((c) => <Row key={c.path} node={c} depth={1} />)
          ) : (
            <div className="px-6 py-1.5 text-[12px] text-[var(--color-text-subtle)]">
              加载中…
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function FileTree() {
  const { roots, addFolder, refreshAllTrees, collapseAll, movePath } = useStore();
  const [refreshing, setRefreshing] = useState(false);

  // dnd-kit — handle move-to-folder. 8px distance keeps clicks intact.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );
  const onDragEnd = (e: DragEndEvent) => {
    const src = e.active.data.current?.path as string | undefined;
    const dest = e.over?.data.current?.path as string | undefined;
    const destIsDir = e.over?.data.current?.isDir as boolean | undefined;
    if (!src || !dest || !destIsDir) return;
    if (src === dest) return;
    movePath(src, dest).catch((err) => console.warn("[FileTree] movePath failed", err));
  };

  const handleRefreshAll = async () => {
    setRefreshing(true);
    try {
      await refreshAllTrees();
    } finally {
      setTimeout(() => setRefreshing(false), 300);
    }
  };

  if (!roots.length) {
    return (
      <div className="flex flex-col items-center justify-center h-full px-6 text-center text-[var(--color-text-muted)]">
        <FolderOpen size={32} className="mb-4 opacity-30" strokeWidth={1.5} />
        <p className="text-[13px] mb-4 leading-relaxed">还没有添加任何文件夹</p>
        <button
          onClick={addFolder}
          className="px-3.5 py-1.5 text-[12.5px] rounded-md bg-[var(--color-text)] text-[var(--color-bg)] hover:opacity-85"
        >
          添加文件夹
        </button>
      </div>
    );
  }

  const target = roots[0];

  return (
    <div className="h-full flex flex-col">
      {/* Workspace switcher */}
      <div className="px-4 pt-4 pb-2">
        <WorkspaceSwitcher />
      </div>
      {/* Action toolbar */}
      <div className="flex items-center gap-0.5 px-2 pb-1.5">
        <button
          onClick={async () => {
            const name = prompt(`新建文件 (in ${basename(target)})`);
            if (name) await useStore.getState().createFile(target, name);
          }}
          title={`在 ${basename(target)} 新建文件`}
          className="p-1.5 rounded hover:bg-[var(--color-bg-muted)] text-[var(--color-text-muted)]"
        >
          <FilePlus size={13} strokeWidth={1.75} />
        </button>
        <button
          onClick={async () => {
            const name = prompt(`新建文件夹 (in ${basename(target)})`);
            if (name) await useStore.getState().createFolder(target, name);
          }}
          title={`在 ${basename(target)} 新建文件夹`}
          className="p-1.5 rounded hover:bg-[var(--color-bg-muted)] text-[var(--color-text-muted)]"
        >
          <FolderPlus size={13} strokeWidth={1.75} />
        </button>
        <button
          onClick={collapseAll}
          title="折叠所有"
          className="p-1.5 rounded hover:bg-[var(--color-bg-muted)] text-[var(--color-text-muted)]"
        >
          <ChevronsDownUp size={13} strokeWidth={1.75} />
        </button>
        <button
          onClick={handleRefreshAll}
          title="刷新所有"
          className="p-1.5 rounded hover:bg-[var(--color-bg-muted)] text-[var(--color-text-muted)]"
        >
          <RefreshCw
            size={13}
            strokeWidth={1.75}
            className={refreshing ? "animate-spin" : undefined}
          />
        </button>
        <div className="flex-1" />
        <button
          onClick={addFolder}
          title="添加工作区"
          className="p-1.5 rounded hover:bg-[var(--color-bg-muted)] text-[var(--color-text-muted)]"
        >
          <Plus size={13} strokeWidth={1.75} />
        </button>
      </div>
      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <div className="flex-1 overflow-y-auto pt-1 pb-2">
          {roots.map((r) => (
            <WorkspaceSection key={r} rootPath={r} />
          ))}
        </div>
      </DndContext>
    </div>
  );
}

/** Workspace dropdown — shown at top of file tree.
 *  Click name → menu lists all workspaces + create/rename/delete actions. */
function WorkspaceSwitcher() {
  const {
    workspaces,
    activeWorkspaceId,
    switchWorkspace,
    createWorkspace,
    renameWorkspace,
    deleteWorkspace,
  } = useStore();
  const [open, setOpen] = useState(false);
  const active = workspaces.find((w) => w.id === activeWorkspaceId);

  if (!active) return <span className="geek-label">files</span>;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 w-full text-left rounded-md px-1.5 py-0.5 -mx-1.5 hover:bg-[color-mix(in_oklab,var(--color-text)_6%,transparent)] transition-colors"
        title="切换工作区"
      >
        <span className="text-[11px] uppercase tracking-[0.09em] text-[var(--color-text-subtle)] font-semibold">
          工作区
        </span>
        <span className="text-[12.5px] text-[var(--color-text)] font-medium truncate flex-1">
          {active.name}
        </span>
        <ChevronDown
          size={11}
          strokeWidth={2}
          className={clsx(
            "text-[var(--color-text-subtle)] shrink-0 transition-transform duration-150",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            className="absolute left-0 right-0 top-full mt-1.5 z-50 bg-[var(--color-bg-soft)] rounded-xl py-1.5"
            style={{
              boxShadow: `
                inset 0 0 0 1px var(--glass-border),
                0 8px 24px rgba(0, 0, 0, 0.4),
                0 20px 48px rgba(0, 0, 0, 0.35)
              `,
            }}
          >
            <div className="px-3 pt-1 pb-2 text-[9.5px] uppercase tracking-[0.09em] text-[var(--color-text-subtle)] font-semibold">
              切换工作区
            </div>
            {workspaces.map((w) => (
              <WorkspaceRow
                key={w.id}
                ws={w}
                active={w.id === activeWorkspaceId}
                canDelete={workspaces.length > 1}
                onSelect={async () => {
                  setOpen(false);
                  if (w.id !== activeWorkspaceId) await switchWorkspace(w.id);
                }}
                onRename={(name) => renameWorkspace(w.id, name)}
                onDelete={async () => {
                  if (confirm(`删除工作区 "${w.name}"？\n\n该工作区的文件夹引用会被移除，但磁盘文件不会被删除。`)) {
                    await deleteWorkspace(w.id);
                    setOpen(false);
                  }
                }}
              />
            ))}
            <div className="my-1 mx-2 h-px bg-[var(--glass-border,var(--color-border))]" />
            <button
              onClick={async () => {
                const name = prompt("新工作区名称");
                if (name) await createWorkspace(name);
                setOpen(false);
              }}
              className="flex items-center gap-1.5 w-full text-left px-3.5 py-1.5 mx-1 rounded-md text-[12.5px] hover:bg-[color-mix(in_oklab,var(--color-text)_8%,transparent)]"
            >
              <Plus size={11} strokeWidth={2} className="text-[var(--color-text-subtle)]" />
              新建工作区
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function WorkspaceRow({
  ws,
  active,
  canDelete,
  onSelect,
  onRename,
  onDelete,
}: {
  ws: { id: string; name: string; roots: string[] };
  active: boolean;
  canDelete: boolean;
  onSelect: () => void;
  onRename: (n: string) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(ws.name);

  if (editing) {
    return (
      <div className="px-3.5 py-1 mx-1 flex items-center gap-1.5">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              onRename(draft);
              setEditing(false);
            }
            if (e.key === "Escape") setEditing(false);
          }}
          autoFocus
          className="cyber-input flex-1 px-2 py-1 text-[12px]"
        />
      </div>
    );
  }

  return (
    <div className="group flex items-center mx-1">
      <button
        onClick={onSelect}
        className={clsx(
          "flex-1 flex items-center gap-2 text-left px-3.5 py-1.5 rounded-md text-[12.5px]",
          active
            ? "text-[var(--color-text)] font-medium"
            : "text-[var(--color-text-muted)] hover:bg-[color-mix(in_oklab,var(--color-text)_8%,transparent)] hover:text-[var(--color-text)]",
        )}
      >
        <Check
          size={11}
          strokeWidth={2.5}
          className={active ? "text-[var(--color-accent)]" : "text-transparent"}
        />
        <span className="truncate flex-1">{ws.name}</span>
        <span className="text-[10px] text-[var(--color-text-subtle)] tabular-nums">
          {ws.roots.length}
        </span>
      </button>
      <button
        onClick={() => {
          setDraft(ws.name);
          setEditing(true);
        }}
        className="opacity-0 group-hover:opacity-100 p-1 rounded-md text-[var(--color-text-subtle)] hover:text-[var(--color-text)] hover:bg-[color-mix(in_oklab,var(--color-text)_8%,transparent)] mx-0.5"
        title="重命名"
      >
        <Pencil size={10} strokeWidth={1.75} />
      </button>
      {canDelete && (
        <button
          onClick={onDelete}
          className="opacity-0 group-hover:opacity-100 p-1 rounded-md text-[var(--color-text-subtle)] hover:text-[var(--color-danger)] hover:bg-[color-mix(in_oklab,var(--color-danger)_12%,transparent)] mr-1"
          title="删除工作区"
        >
          <Trash2 size={10} strokeWidth={1.75} />
        </button>
      )}
    </div>
  );
}
