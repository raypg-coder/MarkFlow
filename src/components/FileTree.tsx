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
} from "lucide-react";
import clsx from "clsx";
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
  if (status === "new") return <span className="git-flag git-flag-new">[+]</span>;
  if (status === "mod") return <span className="git-flag git-flag-mod">[M]</span>;
  return <span className="git-flag git-flag-del">[-]</span>;
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

  return (
    <>
      <div
        className={clsx(
          "scan-row group flex items-center gap-1.5 pr-2 py-[5px] cursor-pointer text-[13px] select-none rounded-md mx-1",
          fileStatus === "mod" && "row-mod",
          isActive ? "is-active" : "text-[var(--color-text)] hover:bg-[var(--color-bg-soft)]",
        )}
        style={{ paddingLeft: 6 + depth * 14 }}
        onClick={onClick}
        onContextMenu={onContextMenu}
      >
        {isSaving && <div className="saving-beam" />}
        {node.is_dir ? (
          open ? (
            <ChevronDown size={11} className="text-[var(--color-text-subtle)] shrink-0" />
          ) : (
            <ChevronRight size={11} className="text-[var(--color-text-subtle)] shrink-0" />
          )
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
            <span className="flex-1 truncate font-mono text-[12.5px] tracking-tight">{node.name}</span>
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
            style={{ left: menu.x, top: menu.y }}
            className="absolute bg-[var(--color-bg)] border border-[var(--color-border)] rounded-md shadow-lg shadow-black/5 py-1 text-[13px] min-w-[160px]"
            onClick={(e) => e.stopPropagation()}
          >
            {node.is_dir && (
              <>
                <button
                  className="block w-full text-left px-3 py-1.5 hover:bg-[var(--color-bg-soft)]"
                  onClick={async () => {
                    setMenu(null);
                    const name = prompt("文件名 (例: notes.md)");
                    if (name) await createFile(node.path, name);
                  }}
                >
                  新建文件
                </button>
                <button
                  className="block w-full text-left px-3 py-1.5 hover:bg-[var(--color-bg-soft)]"
                  onClick={async () => {
                    setMenu(null);
                    const name = prompt("文件夹名");
                    if (name) await createFolder(node.path, name);
                  }}
                >
                  新建文件夹
                </button>
                <div className="my-1 h-px bg-[var(--color-border)]" />
              </>
            )}
            <button
              className="block w-full text-left px-3 py-1.5 hover:bg-[var(--color-bg-soft)]"
              onClick={() => {
                setMenu(null);
                setEditing(true);
              }}
            >
              重命名
            </button>
            <button
              className="block w-full text-left px-3 py-1.5 hover:bg-[var(--color-bg-soft)] text-[var(--color-danger)]"
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

  return (
    <div className="mb-1">
      <div
        className="group flex items-center gap-1.5 px-3 py-1.5 cursor-pointer select-none hover:bg-[color-mix(in_oklab,var(--color-text)_6%,transparent)] rounded-md mx-1"
        onClick={() => toggleExpand(rootPath)}
        title={rootPath}
      >
        {open ? (
          <ChevronDown size={11} className="text-[var(--color-text-subtle)] shrink-0" />
        ) : (
          <ChevronRight size={11} className="text-[var(--color-text-subtle)] shrink-0" />
        )}
        <span className="text-[11px] tracking-[0.06em] text-[var(--color-accent)] font-mono truncate flex-1">
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
  const { roots, addFolder, refreshAllTrees, collapseAll } = useStore();
  const [refreshing, setRefreshing] = useState(false);

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
      {/* Title row */}
      <div className="px-3 pt-3 pb-1">
        <span className="geek-label">files</span>
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
      <div className="flex-1 overflow-y-auto pt-1 pb-2">
        {roots.map((r) => (
          <WorkspaceSection key={r} rootPath={r} />
        ))}
      </div>
    </div>
  );
}
