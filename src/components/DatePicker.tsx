/**
 * Custom calendar + time picker.
 *
 * Used by Mission deadline editor. Replaces the native <input type="datetime-local">
 * which renders OS-styled and doesn't match the glass aesthetic.
 *
 * UX:
 *   - Month grid (Sun-Sat), prev/next arrows, "今天" jump
 *   - Time picker below (hour + minute, 2-digit inputs)
 *   - "清除" button to clear deadline (returns null)
 *   - "应用" button commits selection
 *   - Esc / click outside cancels
 */
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface Props {
  /** Initial timestamp (ms) — null/undefined means "no deadline yet" */
  value: number | null | undefined;
  onChange: (ts: number | null) => void;
  onClose: () => void;
  /** Anchor position — popover renders centered + below; caller controls placement */
}

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];
const MONTHS = ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"];

function startOfDay(d: Date): Date {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function buildMonthCells(viewYear: number, viewMonth: number): Date[] {
  // Returns 42 cells (6 weeks * 7 days) starting from Sunday on/before the 1st of month
  const first = new Date(viewYear, viewMonth, 1);
  const startWeekday = first.getDay();                  // 0 = Sun
  const cells: Date[] = [];
  const cur = new Date(viewYear, viewMonth, 1 - startWeekday);
  for (let i = 0; i < 42; i++) {
    cells.push(new Date(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return cells;
}

export function DatePicker({ value, onChange, onClose }: Props) {
  const initial = value ? new Date(value) : new Date();
  const [selected, setSelected] = useState<Date>(initial);
  const [viewYear, setViewYear] = useState(initial.getFullYear());
  const [viewMonth, setViewMonth] = useState(initial.getMonth());
  const [hour, setHour] = useState<string>(String(initial.getHours()).padStart(2, "0"));
  const [minute, setMinute] = useState<string>(String(initial.getMinutes()).padStart(2, "0"));
  const rootRef = useRef<HTMLDivElement>(null);

  // Close on outside click or Esc
  useEffect(() => {
    const onDocDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onDocDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const cells = buildMonthCells(viewYear, viewMonth);
  const today = startOfDay(new Date());

  const commit = () => {
    const h = Math.max(0, Math.min(23, parseInt(hour, 10) || 0));
    const m = Math.max(0, Math.min(59, parseInt(minute, 10) || 0));
    const d = new Date(selected);
    d.setHours(h, m, 0, 0);
    onChange(d.getTime());
    onClose();
  };

  const goPrev = () => {
    let y = viewYear;
    let m = viewMonth - 1;
    if (m < 0) {
      m = 11;
      y -= 1;
    }
    setViewYear(y);
    setViewMonth(m);
  };
  const goNext = () => {
    let y = viewYear;
    let m = viewMonth + 1;
    if (m > 11) {
      m = 0;
      y += 1;
    }
    setViewYear(y);
    setViewMonth(m);
  };
  const goToday = () => {
    const now = new Date();
    setViewYear(now.getFullYear());
    setViewMonth(now.getMonth());
    setSelected(now);
    setHour(String(now.getHours()).padStart(2, "0"));
    setMinute(String(now.getMinutes()).padStart(2, "0"));
  };

  return (
    <div
      ref={rootRef}
      className="date-picker absolute z-50 mt-1.5 rounded-xl p-3 w-[280px] bg-[var(--color-bg-soft)]"
      style={{
        boxShadow: `
          inset 0 0 0 1px var(--glass-border),
          0 8px 24px rgba(0, 0, 0, 0.4),
          0 20px 48px rgba(0, 0, 0, 0.35)
        `,
      }}
    >
      {/* Month header */}
      <div className="flex items-center gap-1 mb-2">
        <button
          onClick={goPrev}
          className="p-1 rounded-md hover:bg-[color-mix(in_oklab,var(--color-text)_8%,transparent)] text-[var(--color-text-muted)]"
          title="上一月"
        >
          <ChevronLeft size={13} strokeWidth={1.75} />
        </button>
        <div className="flex-1 text-center text-[13px] font-medium tabular-nums">
          {viewYear} 年 {MONTHS[viewMonth]}
        </div>
        <button
          onClick={goNext}
          className="p-1 rounded-md hover:bg-[color-mix(in_oklab,var(--color-text)_8%,transparent)] text-[var(--color-text-muted)]"
          title="下一月"
        >
          <ChevronRight size={13} strokeWidth={1.75} />
        </button>
      </div>

      {/* Weekday header */}
      <div className="grid grid-cols-7 gap-0.5 mb-1">
        {WEEKDAYS.map((d) => (
          <div
            key={d}
            className="text-center text-[10px] py-1 text-[var(--color-text-subtle)] font-medium"
          >
            {d}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((d, i) => {
          const inMonth = d.getMonth() === viewMonth;
          const isToday = isSameDay(d, today);
          const isSelected = isSameDay(d, selected);
          return (
            <button
              key={i}
              onClick={() => setSelected(d)}
              className={[
                "h-7 text-[11.5px] rounded-md tabular-nums transition-colors",
                isSelected
                  ? "bg-[var(--color-accent)] text-white font-medium"
                  : inMonth
                  ? "text-[var(--color-text)] hover:bg-[color-mix(in_oklab,var(--color-text)_8%,transparent)]"
                  : "text-[var(--color-text-subtle)] hover:bg-[color-mix(in_oklab,var(--color-text)_4%,transparent)]",
                !isSelected && isToday && "ring-1 ring-inset ring-[var(--color-accent)]",
              ].join(" ")}
            >
              {d.getDate()}
            </button>
          );
        })}
      </div>

      {/* Time + actions */}
      <div className="mt-3 flex items-center gap-2">
        <div className="flex items-center gap-1 px-2 py-1 cyber-input">
          <input
            type="text"
            inputMode="numeric"
            maxLength={2}
            value={hour}
            onChange={(e) => setHour(e.target.value.replace(/\D/g, ""))}
            onBlur={() => setHour(String(Math.max(0, Math.min(23, parseInt(hour, 10) || 0))).padStart(2, "0"))}
            className="w-6 bg-transparent outline-none text-[12px] text-center tabular-nums"
            title="小时"
          />
          <span className="text-[var(--color-text-subtle)]">:</span>
          <input
            type="text"
            inputMode="numeric"
            maxLength={2}
            value={minute}
            onChange={(e) => setMinute(e.target.value.replace(/\D/g, ""))}
            onBlur={() => setMinute(String(Math.max(0, Math.min(59, parseInt(minute, 10) || 0))).padStart(2, "0"))}
            className="w-6 bg-transparent outline-none text-[12px] text-center tabular-nums"
            title="分钟"
          />
        </div>
        <button
          onClick={goToday}
          className="text-[11px] px-2 py-1 rounded-md text-[var(--color-text-muted)] hover:bg-[color-mix(in_oklab,var(--color-text)_8%,transparent)]"
        >
          今天
        </button>
        <div className="flex-1" />
        {value != null && (
          <button
            onClick={() => {
              onChange(null);
              onClose();
            }}
            className="text-[11px] px-2 py-1 rounded-md text-[var(--color-danger)] hover:bg-[color-mix(in_oklab,var(--color-danger)_12%,transparent)]"
            title="清除截止时间"
          >
            清除
          </button>
        )}
        <button
          onClick={commit}
          className="text-[11px] px-2.5 py-1 rounded-md font-medium bg-[var(--color-accent)] text-white hover:opacity-90"
        >
          确定
        </button>
      </div>
    </div>
  );
}
