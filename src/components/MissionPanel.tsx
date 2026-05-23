import { useEffect, useState } from "react";
import { Plus, Trash2, Clock, Check, GripVertical } from "lucide-react";
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
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useStore } from "../store";
import type { Mission, MissionPriority } from "../types";
import { DatePicker } from "./DatePicker";

const PRIORITY_LABELS: Record<MissionPriority, string> = {
  low: "Low",
  mid: "Mid",
  high: "High",
  critical: "Urgent",
};

export function MissionPanel() {
  const {
    missions,
    addMission,
    toggleMission,
    deleteMission,
    updateMission,
    reorderMissions,
    lastObjectivesClearedAt,
    clearObjectivesFlash,
  } = useStore();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const from = missions.findIndex((m) => m.id === e.active.id);
    const to = missions.findIndex((m) => m.id === e.over!.id);
    if (from !== -1 && to !== -1) reorderMissions(from, to);
  };

  const [input, setInput] = useState("");
  const [priority, setPriority] = useState<MissionPriority>("mid");
  const [showAllClear, setShowAllClear] = useState(false);

  useEffect(() => {
    if (lastObjectivesClearedAt) {
      setShowAllClear(true);
      const t = setTimeout(() => {
        setShowAllClear(false);
        clearObjectivesFlash();
      }, 1800);
      return () => clearTimeout(t);
    }
  }, [lastObjectivesClearedAt, clearObjectivesFlash]);

  const total = missions.length;
  const done = missions.filter((m) => m.completed).length;
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);

  const submit = () => {
    const t = input.trim();
    if (!t) return;
    addMission(t, priority);
    setInput("");
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header — clean section title + counter */}
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-center justify-between mb-3">
          <span className="geek-label">tasks</span>
          <span className="text-[11px] text-[var(--color-text-muted)] tabular-nums">
            {done} / {total}
          </span>
        </div>
        <ProgressBar pct={pct} />
      </div>

      {/* Add bar — glass input + priority chip row */}
      <div className="px-4 pb-3 space-y-2">
        <div className="cyber-input flex items-center gap-2 px-3 py-2">
          <Plus size={13} className="text-[var(--color-text-subtle)]" strokeWidth={1.75} />
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
            }}
            placeholder="新建任务…"
            className="bg-transparent flex-1 outline-none text-[12.5px] placeholder:text-[var(--color-text-subtle)]"
          />
          {input.trim() && (
            <button
              onClick={submit}
              className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-[var(--color-accent)] text-white hover:opacity-90"
              title="添加 (Enter)"
            >
              添加
            </button>
          )}
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-[var(--color-text-subtle)] mr-1">优先级</span>
          {(["low", "mid", "high", "critical"] as MissionPriority[]).map((p) => (
            <button
              key={p}
              onClick={() => setPriority(p)}
              className={`text-[10.5px] px-2 py-0.5 rounded-full transition-colors ${
                priority === p
                  ? `priority-chip priority-chip-${p} priority-chip-on`
                  : "text-[var(--color-text-subtle)] hover:text-[var(--color-text-muted)]"
              }`}
            >
              {PRIORITY_LABELS[p]}
            </button>
          ))}
        </div>
      </div>

      {/* List — sortable via @dnd-kit */}
      <div className="flex-1 overflow-y-auto pb-3 px-2.5 space-y-1.5">
        {missions.length === 0 && (
          <div className="px-2 py-6 text-[12px] text-[var(--color-text-subtle)] text-center">
            还没有任务
          </div>
        )}
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext
            items={missions.map((m) => m.id)}
            strategy={verticalListSortingStrategy}
          >
            {missions.map((m) => (
              <MissionCard
                key={m.id}
                mission={m}
                onToggle={() => toggleMission(m.id)}
                onDelete={() => deleteMission(m.id)}
                onUpdate={(patch) => updateMission(m.id, patch)}
              />
            ))}
          </SortableContext>
        </DndContext>
      </div>

      {showAllClear && <AllClearOverlay />}
    </div>
  );
}

function ProgressBar({ pct }: { pct: number }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex-1 h-1.5 rounded-full bg-[color-mix(in_oklab,var(--color-text)_8%,transparent)] overflow-hidden">
        <div
          className="h-full rounded-full bg-[var(--color-accent)] transition-[width] duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-[10px] text-[var(--color-text-muted)] tabular-nums w-9 text-right">
        {pct}%
      </span>
    </div>
  );
}

function MissionCard({
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
  const [editingDate, setEditingDate] = useState(false);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: mission.id,
  });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 10 : "auto",
        opacity: isDragging ? 0.9 : 1,
      }}
      {...attributes}
      className={`mission-card mission-card-v2 group ${
        mission.completed ? "is-done" : ""
      } priority-${mission.priority} ${isDragging ? "mission-card-dragging" : ""}`}
    >
      <div className="flex items-start gap-2.5 p-3">
        {/* Drag handle — only visible on hover, doesn't interfere with click */}
        <button
          {...listeners}
          className="opacity-0 group-hover:opacity-100 text-[var(--color-text-subtle)] hover:text-[var(--color-text-muted)] cursor-grab active:cursor-grabbing -ml-1 self-stretch flex items-center transition-opacity"
          title="拖拽排序"
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical size={12} strokeWidth={1.75} />
        </button>
        <RoundCheckbox checked={mission.completed} onClick={onToggle} />
        <div className="flex-1 min-w-0">
          <div
            className={`text-[13px] leading-snug ${
              mission.completed
                ? "text-[var(--color-text-muted)] line-through decoration-[var(--color-text-subtle)]"
                : "text-[var(--color-text)]"
            }`}
          >
            {mission.title}
          </div>
          <div className="flex items-center gap-2 mt-1.5">
            <span
              className={`priority-chip priority-chip-${mission.priority} priority-chip-on text-[9.5px] px-1.5 py-0.5 rounded-full`}
            >
              {PRIORITY_LABELS[mission.priority]}
            </span>
            {mission.deadline ? (
              <button
                onClick={() => setEditingDate(true)}
                className="hover:opacity-80 cursor-pointer"
                title="点击修改截止时间"
              >
                <CountdownClock deadline={mission.deadline} />
              </button>
            ) : (
              <button
                onClick={() => setEditingDate(true)}
                className="text-[10px] text-[var(--color-text-subtle)] hover:text-[var(--color-accent)] flex items-center gap-1 transition-colors"
                title="设置截止时间"
              >
                <Clock size={9.5} strokeWidth={1.75} />
                设置截止
              </button>
            )}
          </div>
        </div>
        <button
          onClick={onDelete}
          className="opacity-0 group-hover:opacity-100 text-[var(--color-text-subtle)] hover:text-[var(--color-danger)] transition-opacity p-1 -m-1"
          title="删除"
        >
          <Trash2 size={12} strokeWidth={1.75} />
        </button>
      </div>

      {editingDate && (
        <div className="relative">
          <DatePicker
            value={mission.deadline}
            onChange={(ts) => onUpdate({ deadline: ts })}
            onClose={() => setEditingDate(false)}
          />
        </div>
      )}
    </div>
  );
}

function RoundCheckbox({ checked, onClick }: { checked: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`octagon-check shrink-0 ${checked ? "is-checked" : ""}`}
      aria-checked={checked}
      role="checkbox"
    >
      <span className="octagon-glyph">
        {checked && <Check size={10} strokeWidth={3} />}
      </span>
    </button>
  );
}

function CountdownClock({ deadline }: { deadline: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);  // 30s tick is enough for human-readable
    return () => clearInterval(t);
  }, []);
  const diff = deadline - now;
  const overdue = diff < 0;
  const abs = Math.abs(diff);
  const d = Math.floor(abs / 86400000);
  const h = Math.floor((abs % 86400000) / 3600000);
  const m = Math.floor((abs % 3600000) / 60000);

  // Human-readable, modern productivity format
  let label: string;
  if (d > 0) label = `${d} 天${h > 0 ? ` ${h} 小时` : ""}`;
  else if (h > 0) label = `${h} 小时${m > 0 ? ` ${m} 分` : ""}`;
  else label = `${Math.max(m, 1)} 分钟`;

  const colorClass = overdue
    ? "text-[var(--color-danger)]"
    : diff < 86400000
    ? "text-[var(--color-warning)]"
    : "text-[var(--color-text-muted)]";

  return (
    <span
      className={`text-[10px] flex items-center gap-1 ${colorClass}`}
      title={new Date(deadline).toLocaleString()}
    >
      <Clock size={9.5} strokeWidth={1.75} />
      {overdue ? `逾期 ${label}` : `还剩 ${label}`}
    </span>
  );
}

function AllClearOverlay() {
  return (
    <div className="all-clear-overlay">
      <div className="all-clear-text">所有任务完成 ✓</div>
    </div>
  );
}
