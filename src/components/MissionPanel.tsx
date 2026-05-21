import { useEffect, useState } from "react";
import { Plus, Trash2, Clock } from "lucide-react";
import { useStore } from "../store";
import type { Mission, MissionPriority } from "../types";

const PRIORITY_LABELS: Record<MissionPriority, string> = {
  low: "lvl_01",
  mid: "lvl_02",
  high: "lvl_03",
  critical: "critical",
};

export function MissionPanel() {
  const {
    missions,
    addMission,
    toggleMission,
    deleteMission,
    updateMission,
    lastObjectivesClearedAt,
    clearObjectivesFlash,
  } = useStore();

  const [input, setInput] = useState("");
  const [priority, setPriority] = useState<MissionPriority>("mid");
  const [showAllClear, setShowAllClear] = useState(false);

  // Show overlay when transitioning to all-clear
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
  const progress = total === 0 ? 0 : done / total;

  const submit = () => {
    const t = input.trim();
    if (!t) return;
    addMission(t, priority);
    setInput("");
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-3 pt-3 pb-2">
        <div className="flex items-center justify-between mb-2">
          <span className="geek-label">missions</span>
          <span className="font-mono text-[10px] text-[var(--color-text-muted)] tabular-nums">
            {done}/{total}
          </span>
        </div>
        <EnergyBar segments={total} filled={done} progress={progress} />
      </div>

      {/* Add bar */}
      <div className="px-3 pb-3 space-y-1.5">
        <div className="cyber-input flex items-center gap-1.5 px-2 py-1">
          <span className="text-[10.5px] text-[var(--color-accent)] font-mono">{">"}</span>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
            }}
            placeholder="new mission..."
            className="bg-transparent flex-1 outline-none text-[12px] font-mono placeholder:text-[var(--color-text-subtle)]"
          />
          <button
            onClick={submit}
            disabled={!input.trim()}
            className="text-[var(--color-accent)] hover:opacity-80 disabled:opacity-30 px-1"
            title="add"
          >
            <Plus size={11} strokeWidth={2} />
          </button>
        </div>
        <div className="flex items-center gap-0.5">
          <span className="text-[9.5px] text-[var(--color-text-subtle)] mr-1 font-mono">PRI</span>
          {(["low", "mid", "high", "critical"] as MissionPriority[]).map((p) => (
            <button
              key={p}
              onClick={() => setPriority(p)}
              className={`text-[9.5px] font-mono px-1.5 py-0.5 rounded-sm transition-colors ${
                priority === p
                  ? `priority-pill priority-${p} priority-on`
                  : "text-[var(--color-text-subtle)] hover:text-[var(--color-text-muted)]"
              }`}
            >
              {PRIORITY_LABELS[p]}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto pb-3 px-2">
        {missions.length === 0 && (
          <div className="px-2 py-3 text-[11.5px] text-[var(--color-text-subtle)] font-mono">
            no active missions
          </div>
        )}
        {missions.map((m) => (
          <MissionCard
            key={m.id}
            mission={m}
            onToggle={() => toggleMission(m.id)}
            onDelete={() => deleteMission(m.id)}
            onUpdate={(patch) => updateMission(m.id, patch)}
          />
        ))}
      </div>

      {showAllClear && <AllClearOverlay />}
    </div>
  );
}

function EnergyBar({
  segments,
  filled,
  progress,
}: {
  segments: number;
  filled: number;
  progress: number;
}) {
  const n = Math.max(segments, 8);
  return (
    <div className="flex items-center gap-2">
      <div className="energy-bar flex-1 flex gap-[2px] h-2">
        {Array.from({ length: n }).map((_, i) => (
          <div
            key={i}
            className={`flex-1 ${
              segments > 0 && i < filled
                ? "bg-[var(--color-accent)] shadow-[0_0_4px_var(--color-accent)]"
                : "bg-[color-mix(in_oklab,var(--color-accent)_8%,transparent)]"
            }`}
          />
        ))}
      </div>
      <span className="font-mono text-[9.5px] text-[var(--color-accent)] tabular-nums w-9 text-right">
        {Math.round(progress * 100)}%
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

  return (
    <div
      className={`mission-card mb-2 ${mission.completed ? "is-done" : ""} priority-${mission.priority}`}
    >
      <div className="flex items-center justify-between px-2 pt-1.5 pb-1">
        <span className={`priority-pill priority-${mission.priority} priority-on font-mono text-[9px]`}>
          [{PRIORITY_LABELS[mission.priority]}]
        </span>
        <div className="flex items-center gap-1.5">
          {mission.deadline ? (
            <CountdownClock deadline={mission.deadline} />
          ) : (
            <button
              onClick={() => setEditingDate(true)}
              className="text-[9.5px] text-[var(--color-text-subtle)] hover:text-[var(--color-accent)] font-mono flex items-center gap-0.5"
              title="set deadline"
            >
              <Clock size={9} />
              set
            </button>
          )}
          <button
            onClick={onDelete}
            className="text-[var(--color-text-subtle)] hover:text-[var(--color-danger)] opacity-0 group-hover:opacity-100 transition-opacity"
            title="delete"
          >
            <Trash2 size={10} strokeWidth={1.75} />
          </button>
        </div>
      </div>

      <div className="flex items-start gap-2 px-2 pb-2 group">
        <OctagonCheckbox checked={mission.completed} onClick={onToggle} />
        <div className="mission-title-wrap flex-1 relative">
          <span
            className={`mission-title text-[12.5px] font-mono leading-snug ${
              mission.completed ? "text-[var(--color-text-muted)]" : "text-[var(--color-text)]"
            }`}
          >
            {mission.title}
          </span>
        </div>
        <button
          onClick={onDelete}
          className="opacity-0 group-hover:opacity-60 hover:!opacity-100 text-[var(--color-text-subtle)] hover:text-[var(--color-danger)] transition-opacity"
          title="delete"
        >
          <Trash2 size={11} strokeWidth={1.75} />
        </button>
      </div>

      {editingDate && (
        <div className="px-2 pb-2">
          <input
            type="datetime-local"
            autoFocus
            onBlur={() => setEditingDate(false)}
            onChange={(e) => {
              const ts = e.target.value ? new Date(e.target.value).getTime() : null;
              onUpdate({ deadline: ts });
              setEditingDate(false);
            }}
            className="cyber-input px-2 py-1 text-[11px] font-mono w-full"
          />
        </div>
      )}
    </div>
  );
}

function OctagonCheckbox({ checked, onClick }: { checked: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`octagon-check ${checked ? "is-checked" : ""}`}
      aria-checked={checked}
      role="checkbox"
    >
      <span className="octagon-glyph">{checked ? "×" : ""}</span>
    </button>
  );
}

function CountdownClock({ deadline }: { deadline: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const diff = deadline - now;
  const overdue = diff < 0;
  const abs = Math.abs(diff);
  const d = Math.floor(abs / 86400000);
  const h = Math.floor((abs % 86400000) / 3600000);
  const m = Math.floor((abs % 3600000) / 60000);
  const s = Math.floor((abs % 60000) / 1000);
  const fmt = (n: number) => n.toString().padStart(2, "0");
  return (
    <span
      className={`countdown font-mono text-[9.5px] tabular-nums ${
        overdue
          ? "text-[var(--color-danger)]"
          : diff < 3600000 * 24
          ? "text-[var(--color-accent-3,#ff007f)]"
          : "text-[var(--color-text-muted)]"
      }`}
      title={new Date(deadline).toLocaleString()}
    >
      [{overdue ? "-" : ""}
      {fmt(d)}:{fmt(h)}:{fmt(m)}:{fmt(s)}]
    </span>
  );
}

function AllClearOverlay() {
  return (
    <div className="all-clear-overlay">
      <div className="all-clear-text font-mono">[ ALL OBJECTIVES CLEARED ]</div>
    </div>
  );
}
