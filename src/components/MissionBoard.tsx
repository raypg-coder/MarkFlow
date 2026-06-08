import { useMemo, useState } from "react";
import { Plus, Trash2, Clock, X, Target, Search } from "lucide-react";
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

type StatusFilter = "all" | "active" | "done";
const STATUS_TABS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "active", label: "进行中" },
  { key: "done", label: "已完成" },
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

  const [status, setStatus] = useState<StatusFilter>("all");
  const [query, setQuery] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [deadlineId, setDeadlineId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const total = missions.length;
  const done = missions.filter((m) => m.completed).length;
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);

  const q = query.trim().toLowerCase();
  const lanes = useMemo(() => {
    const g: Record<MissionPriority, Mission[]> = { critical: [], high: [], mid: [], low: [] };
    for (const m of missions) {
      if (status === "active" && m.completed) continue;
      if (status === "done" && !m.completed) continue;
      if (q && !m.title.toLowerCase().includes(q)) continue;
      g[m.priority].push(m);
    }
    return g;
  }, [missions, status, q]);

  const activeMission = activeId ? missions.find((m) => m.id === activeId) ?? null : null;
  const deadlineMission = deadlineId ? missions.find((m) => m.id === deadlineId) ?? null : null;

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
      {/* Toolbar */}
      <div className="mission-board-head">
        <div className="flex items-center gap-2.5 min-w-0 shrink-0">
          <span className="mission-board-icon"><Target size={16} strokeWidth={2} /></span>
          <h1 className="mission-board-title">任务看板</h1>
          <span className="mission-board-count">{done} / {total}</span>
        </div>

        <div className="mission-board-tools">
          {/* status segmented */}
          <div className="mission-seg">
            {STATUS_TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setStatus(t.key)}
                className={`mission-seg-btn ${status === t.key ? "is-on" : ""}`}
              >
                {t.label}
              </button>
            ))}
          </div>
          {/* search */}
          <div className="mission-board-search">
            <Search size={13} strokeWidth={1.75} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索任务…"
              spellCheck={false}
            />
            {query && (
              <button onClick={() => setQuery("")} title="清除" className="mission-board-search-x">
                <X size={12} strokeWidth={2} />
              </button>
            )}
          </div>
          {/* progress */}
          <div className="mission-board-progress" title={`${done}/${total} 已完成`}>
            <div className="mission-board-progress-fill" style={{ width: `${pct}%` }} />
          </div>
          <span className="mission-board-pct">{pct}%</span>
          <button
            onClick={() => setMissionsFullView(false)}
            className="mission-board-close"
            title="关闭看板，回到编辑器"
          >
            <X size={16} strokeWidth={2} />
          </button>
        </div>
      </div>

      {/* Empty state — no tasks at all */}
      {total === 0 ? (
        <BoardEmpty onAdd={(t) => addMission(t, "mid")} />
      ) : (
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={() => setActiveId(null)}
      >
        <div className="mission-board-cols">
          {COLUMNS.map((col) => (
            <Column
              key={col.key}
              col={col}
              items={lanes[col.key]}
              dragging={!!activeId}
              onAdd={(title) => addMission(title, col.key)}
              onToggle={toggleMission}
              onDelete={deleteMission}
              onEditDeadline={setDeadlineId}
            />
          ))}
        </div>

        <DragOverlay dropAnimation={null}>
          {activeMission ? <CardBody mission={activeMission} overlay /> : null}
        </DragOverlay>
      </DndContext>
      )}

      {/* Deadline editor — board-level centered popover so it isn't clipped
          by the column's overflow:auto. */}
      {deadlineMission && (
        <div
          className="mission-date-scrim"
          onMouseDown={(e) => { if (e.target === e.currentTarget) setDeadlineId(null); }}
        >
          <DatePicker
            value={deadlineMission.deadline}
            onChange={(ts) => updateMission(deadlineMission.id, { deadline: ts })}
            onClose={() => setDeadlineId(null)}
          />
        </div>
      )}
    </div>
  );
}

function BoardEmpty({ onAdd }: { onAdd: (title: string) => void }) {
  const [draft, setDraft] = useState("");
  const submit = () => {
    const t = draft.trim();
    if (t) { onAdd(t); setDraft(""); }
  };
  return (
    <div className="mission-empty">
      <span className="mission-empty-icon"><Target size={26} strokeWidth={1.5} /></span>
      <div className="mission-empty-title">还没有任务</div>
      <div className="mission-empty-sub">在下面输入第一个任务，回车创建。之后可以拖到不同优先级泳道。</div>
      <div className="mission-empty-add">
        <Plus size={14} strokeWidth={2} />
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
          placeholder="新建任务…"
          spellCheck={false}
          autoFocus
        />
        {draft.trim() && <button onClick={submit} className="mission-empty-go">添加</button>}
      </div>
    </div>
  );
}

function Column({
  col,
  items,
  dragging,
  onAdd,
  onToggle,
  onDelete,
  onEditDeadline,
}: {
  col: { key: MissionPriority; label: string; tint: string };
  items: Mission[];
  dragging: boolean;
  onAdd: (title: string) => void;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onEditDeadline: (id: string) => void;
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
    <div
      className={`mission-col ${isOver ? "is-over" : ""} ${dragging ? "is-dragging-any" : ""}`}
      ref={setNodeRef}
      style={{ ["--lane-tint" as string]: col.tint }}
    >
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
              onEditDeadline={() => onEditDeadline(m.id)}
            />
          ))}
        </SortableContext>

        {items.length === 0 && (
          <div className="mission-col-empty">{dragging ? "放到这里" : "暂无任务"}</div>
        )}

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
  onEditDeadline,
}: {
  mission: Mission;
  onToggle: () => void;
  onDelete: () => void;
  onEditDeadline: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: mission.id,
  });
  const [editingTitle, setEditingTitle] = useState(false);

  // While editing the title, drag listeners are detached so typing /
  // text-selection don't start a drag.
  const dragProps = editingTitle ? {} : listeners;

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }}
      {...attributes}
      {...dragProps}
      className="mission-bcard-wrap"
    >
      <CardBody
        mission={mission}
        onToggle={onToggle}
        onDelete={onDelete}
        editingTitle={editingTitle}
        setEditingTitle={setEditingTitle}
        onEditDeadline={onEditDeadline}
        onUpdate={(patch) => useStore.getState().updateMission(mission.id, patch)}
      />
    </div>
  );
}

function CardBody({
  mission,
  onToggle,
  onDelete,
  editingTitle,
  setEditingTitle,
  onEditDeadline,
  onUpdate,
  overlay,
}: {
  mission: Mission;
  onToggle?: () => void;
  onDelete?: () => void;
  editingTitle?: boolean;
  setEditingTitle?: (v: boolean) => void;
  onEditDeadline?: () => void;
  onUpdate?: (patch: Partial<Mission>) => void;
  overlay?: boolean;
}) {
  // NOTE: inner controls do NOT stopPropagation on pointerdown — that would
  // block a drag from starting on top of them. dnd-kit's 6px distance
  // threshold already separates a click (toggle / edit / delete / deadline)
  // from a drag, so the WHOLE card is draggable from anywhere while buttons
  // still respond to plain clicks. Only the title input swallows pointerdown
  // (so selecting text doesn't drag).
  const stopClick = (e: React.MouseEvent) => e.stopPropagation();
  const commitTitle = (raw: string) => {
    const t = raw.trim();
    if (t && t !== mission.title) onUpdate?.({ title: t });
    setEditingTitle?.(false);
  };
  return (
    <div className={`mission-bcard group ${mission.completed ? "is-done" : ""} ${overlay ? "is-overlay" : ""}`}>
      <div className="flex items-start gap-2.5">
        <span onClick={stopClick} className="shrink-0">
          <RoundCheckbox checked={mission.completed} onClick={onToggle ?? (() => {})} />
        </span>
        <div className="flex-1 min-w-0">
          {editingTitle ? (
            <input
              autoFocus
              defaultValue={mission.title}
              onPointerDown={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitTitle((e.target as HTMLInputElement).value);
                if (e.key === "Escape") setEditingTitle?.(false);
              }}
              onBlur={(e) => commitTitle(e.target.value)}
              className="mission-bcard-edit"
            />
          ) : (
            <div
              className={`mission-bcard-title ${mission.completed ? "is-done" : ""}`}
              onClick={overlay ? undefined : (e) => { stopClick(e); setEditingTitle?.(true); }}
              title={overlay ? undefined : "点击编辑"}
            >
              {mission.title}
            </div>
          )}
          <div className="flex items-center gap-2 mt-1.5">
            {mission.deadline ? (
              <button onClick={(e) => { stopClick(e); onEditDeadline?.(); }} className="hover:opacity-80 cursor-pointer" title="修改截止时间">
                <CountdownClock deadline={mission.deadline} />
              </button>
            ) : (
              !overlay && (
                <button
                  onClick={(e) => { stopClick(e); onEditDeadline?.(); }}
                  className="mission-bcard-due"
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
            onClick={(e) => { stopClick(e); onDelete?.(); }}
            className="opacity-0 group-hover:opacity-100 text-[var(--color-text-subtle)] hover:text-[var(--color-danger)] transition-opacity p-1 -m-1 shrink-0"
            title="删除"
          >
            <Trash2 size={12} strokeWidth={1.75} />
          </button>
        )}
      </div>
    </div>
  );
}
