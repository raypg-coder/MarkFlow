import { X } from "lucide-react";
import clsx from "clsx";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  horizontalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useStore } from "../store";

export function TabBar() {
  const { openFiles, activePath, setActive, requestCloseFile, reorderTabs } = useStore();

  // 5px activation threshold so plain clicks still register
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const from = openFiles.findIndex((f) => f.path === e.active.id);
    const to = openFiles.findIndex((f) => f.path === e.over!.id);
    if (from !== -1 && to !== -1) reorderTabs(from, to);
  };

  if (!openFiles.length) {
    return <div data-tauri-drag-region className="flex-1 self-stretch" />;
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext
        items={openFiles.map((f) => f.path)}
        strategy={horizontalListSortingStrategy}
      >
        <div data-tauri-drag-region className="flex items-end overflow-x-auto flex-1 min-w-0">
          {openFiles.map((f, i) => (
            <SortableTab
              key={f.path}
              file={f}
              num={String(i + 1).padStart(2, "0")}
              active={f.path === activePath}
              onActivate={() => setActive(f.path)}
              onClose={() => requestCloseFile(f.path)}
            />
          ))}
          <div data-tauri-drag-region className="flex-1 min-w-0 self-stretch" />
        </div>
      </SortableContext>
    </DndContext>
  );
}

function SortableTab({
  file,
  num,
  active,
  onActivate,
  onClose,
}: {
  file: { path: string; name: string; content: string; savedContent: string };
  num: string;
  active: boolean;
  onActivate: () => void;
  onClose: () => void;
}) {
  const dirty = file.content !== file.savedContent;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: file.path,
  });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 10 : "auto",
        opacity: isDragging ? 0.85 : 1,
      }}
      {...attributes}
      {...listeners}
      onClick={onActivate}
      className={clsx(
        "tab-item group flex items-center gap-1.5 pl-2.5 pr-1.5 h-[34px] mx-px text-[12px] cursor-pointer whitespace-nowrap min-w-0 transition-colors",
        active ? "tab-active" : "",
        isDragging && "tab-dragging",
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
      <span className="truncate max-w-[200px]">{file.name}</span>
      <button
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          onClose();
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
}
