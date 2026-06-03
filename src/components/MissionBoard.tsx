import { useMemo, useState } from "react";
import { Plus, Trash2, Clock, X, Target } from "lucide-react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useStore } from "../store";
import type { Mission, MissionPriority } from "../types";
import { DatePicker } from "./DatePicker";
import { CountdownClock, RoundCheckbox } from "./MissionPanel";

// Column order: highest urgency first (left → right)
const COLUMNS: { key: MissionPriority; label: string; tint: string }[] = [
  { key: "critical", label: "紧急", tint: "var(--color-danger)" },
  { key: "high", label: "高", tint: "var(--color-warning)" },
  { key: "mid", label: "中", tint: "var(--color-accent)" },
  { key: "low", label: "低", tint: "var(--color-text-muted)" },
];

export function MissionBoard() {
  const {
    missions,
    addMission,
    toggleMission,
    deleteMission,
    updateMission,
    moveMissionToPriority,
    setMissionsFullView,
  } = useStore();

  const [hideDone, setHideDone] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const total = missions.length;
  const done = missions.filter((m) => m.completed).length;
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);

  // Group missions into lanes, preserving the flat-array order
  const lanes = useMemo(() => {
    const g: Record<MissionPriority, Mission[]> = { critical: [], high: [], mid: [], low: [] };
    for (const m of missions) {
      if (hideDone && m.completed) continue;
      g[m.priority].push(m);
    }
    return g;
  }, [missions, hideDone]);

  const activeMission = activeId ? missions.find((m) => m.id === activeId) ?? null : null;

  const onDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id));

  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = e;
    if (!over) return;
    const activeMid = String(active.id);
    const overId = String(over.id);
    if (activeMid === overId) return;

    let targetPriority: MissionPriority;
    let beforeId: string | null = null;
    if (overId.startsWith("col-")) {
      targetPriority = overId.slice(4) as MissionPriority;
    } else {
      const overM = missions.find((m) => m.id === overId);
      if (!overM) return;
      targetPriority = overM.priority;
      beforeId = overM.id;
    }
    moveMissionToPriority(activeMid, targetPriority, beforeId);
  };

  return (
    <div className="mission-board">
      {/* Header */}
      <div className="mission-board-head">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="mission-board-icon"><Target size={16} strokeWidth={2} /></span>
          <h1 className="mission-board-title">任务看板</h1>
          <span className="mission-board-count">{done} / {total}</span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <div className="mission-board-progress">
            <div className="mission-board-progress-fill" style={{ width: `${pct}%` }} />
          </div>
          <span className="mission-board-pct">{pct}%</span>
          <button
            onClick={() => setHideDone((v) => !v)}
            className={`mission-board-toggle ${hideDone ? "is-on" : ""}`}
            title="隐藏 / 显示已完成"
          >
            {hideDone ? "显示已完成" : "隐藏已完成"}
          </button>
          <button
            onClick={() => setMissionsFullView(false)}
            className="mission-board-close"
            title="关闭看板，回到编辑器"
          >
            <X size={16} strokeWidth={2} />
          </button>
        </div>
      </div>

      {/* Columns */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
      >
        <div className="mission-board-cols">
          {COLUMNS.map((col) => (
            <Column
              key={col.key}
              col={col}
              items={lanes[col.key]}
              onAdd={(title) => addMission(title, col.key)}
              onToggle={toggleMission}
              onDelete={deleteMission}
              onUpdate={updateMission}
            />
          ))}
        </div>

        <DragOverlay dropAnimation={null}>
          {activeMission ? <CardBody mission={activeMission} overlay /> : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

function Column({
  col,
  items,
  onAdd,
  onToggle,
  onDelete,
  onUpdate,
}: {
  col: { key: MissionPriority; label: string; tint: string };
  items: Mission[];
  onAdd: (title: string) => void;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onUpdate: (id: string, patch: Partial<Mission>) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `col-${col.key}` });
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");

  const submit = () => {
    const t = draft.trim();
    if (t) onAdd(t);
    setDraft("");
    setAdding(false);
  };

  return (
    <div className={`mission-col ${isOver ? "is-over" : ""}`} ref={setNodeRef}>
      <div className="mission-col-head">
        <span className="mission-col-dot" style={{ background: col.tint }} />
        <span className="mission-col-label">{col.label}</span>
        <span className="mission-col-count">{items.length}</span>
      </div>

      <div className="mission-col-body">
        <SortableContext items={items.map((m) => m.id)} strategy={verticalListSortingStrategy}>
          {items.map((m) => (
            <SortableCard
              key={m.id}
              mission={m}
              onToggle={() => onToggle(m.id)}
              onDelete={() => onDelete(m.id)}
              onUpdate={(patch) => onUpdate(m.id, patch)}
            />
          ))}
        </SortableContext>

        {items.length === 0 && <div className="mission-col-empty">拖拽任务到此</div>}

        {adding ? (
          <div className="mission-add-card">
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submit();
                if (e.key === "Escape") { setDraft(""); setAdding(false); }
              }}
              onBlur={submit}
              placeholder="任务标题…"
              className="mission-add-input"
            />
          </div>
        ) : (
          <button className="mission-add-btn" onClick={() => setAdding(true)}>
            <Plus size={13} strokeWidth={2} /> 添加任务
          </button>
        )}
      </div>
    </div>
  );
}

function SortableCard({
  mission,
  onToggle,
  onDelete,
  onUpdate,
}: {
  mission: Mission;
  onToggle: () => void;
  onDelete: () => void;
  onUpdate: (patch: Partial<Mission>) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: mission.id,
  });
  const [editingDate, setEditingDate] = useState(false);

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }}
      {...attributes}
      {...listeners}
      className="mission-bcard-wrap"
    >
      <CardBody
        mission={mission}
        onToggle={onToggle}
        onDelete={onDelete}
        editingDate={editingDate}
        setEditingDate={setEditingDate}
        onUpdate={onUpdate}
      />
    </div>
  );
}

function CardBody({
  mission,
  onToggle,
  onDelete,
  editingDate,
  setEditingDate,
  onUpdate,
  overlay,
}: {
  mission: Mission;
  onToggle?: () => void;
  onDelete?: () => void;
  editingDate?: boolean;
  setEditingDate?: (v: boolean) => void;
  onUpdate?: (patch: Partial<Mission>) => void;
  overlay?: boolean;
}) {
  const stop = (e: React.MouseEvent | React.PointerEvent) => e.stopPropagation();
  return (
    <div className={`mission-bcard group ${mission.completed ? "is-done" : ""} ${overlay ? "is-overlay" : ""}`}>
      <div className="flex items-start gap-2.5">
        <span onPointerDown={stop} onClick={stop} className="shrink-0">
          <RoundCheckbox checked={mission.completed} onClick={onToggle ?? (() => {})} />
        </span>
        <div className="flex-1 min-w-0">
          <div className={`mission-bcard-title ${mission.completed ? "is-done" : ""}`}>
            {mission.title}
          </div>
          <div className="flex items-center gap-2 mt-1.5" onPointerDown={stop}>
            {mission.deadline ? (
              <button onClick={() => setEditingDate?.(true)} className="hover:opacity-80 cursor-pointer" title="修改截止时间">
                <CountdownClock deadline={mission.deadline} />
              </button>
            ) : (
              !overlay && (
                <button
                  onClick={() => setEditingDate?.(true)}
                  className="text-[10px] text-[var(--color-text-subtle)] hover:text-[var(--color-accent)] flex items-center gap-1 transition-colors"
                  title="设置截止时间"
                >
                  <Clock size={9.5} strokeWidth={1.75} /> 截止
                </button>
              )
            )}
          </div>
        </div>
        {!overlay && (
          <button
            onPointerDown={stop}
            onClick={(e) => { stop(e); onDelete?.(); }}
            className="opacity-0 group-hover:opacity-100 text-[var(--color-text-subtle)] hover:text-[var(--color-danger)] transition-opacity p-1 -m-1 shrink-0"
            title="删除"
          >
            <Trash2 size={12} strokeWidth={1.75} />
          </button>
        )}
      </div>

      {editingDate && (
        <div className="relative" onPointerDown={stop}>
          <DatePicker
            value={mission.deadline}
            onChange={(ts) => onUpdate?.({ deadline: ts })}
            onClose={() => setEditingDate?.(false)}
          />
        </div>
      )}
    </div>
  );
}
