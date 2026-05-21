import { useEffect, useRef, useState } from "react";
import { VolumeX } from "lucide-react";
import { ambientAudio, PRESETS, type Preset } from "../utils/audio";

export function AudioControl() {
  const [settings, setSettings] = useState(ambientAudio.getSettings());
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    return ambientAudio.subscribe(setSettings);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const playing = settings.preset !== "off";

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        title={playing ? `ambient: ${settings.preset}` : "ambient · off"}
        className={`p-1 rounded-sm transition-colors ${
          playing
            ? "text-[var(--color-accent)]"
            : "text-[var(--chrome-text-subtle)] hover:text-[var(--chrome-text-muted)]"
        }`}
      >
        {playing ? <WaveformIcon active /> : <VolumeX size={11} strokeWidth={1.75} />}
      </button>

      {open && (
        <div
          className="absolute bottom-full right-0 mb-2 w-[200px] bg-[var(--color-bg)] border border-[var(--color-border)] rounded-sm shadow-lg shadow-black/40 p-2.5 z-[60] font-mono"
          style={{
            boxShadow: `
              inset 0 0 0 1px color-mix(in oklab, var(--color-accent) 28%, transparent),
              0 0 20px -8px color-mix(in oklab, var(--color-accent) 30%, transparent),
              0 12px 32px rgba(0,0,0,0.5)
            `,
          }}
        >
          <div className="text-[9.5px] uppercase tracking-[0.12em] text-[var(--color-text-subtle)] mb-2 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-accent)] shadow-[0_0_4px_var(--color-accent)]" />
            ambient_audio
          </div>
          <div className="space-y-0.5">
            {PRESETS.map((p) => {
              const active = settings.preset === p.key;
              return (
                <button
                  key={p.key}
                  onClick={() => ambientAudio.setPreset(p.key as Preset)}
                  className={`w-full text-left text-[11px] px-2 py-1 rounded-sm transition-colors flex items-center gap-2 ${
                    active
                      ? "bg-[color-mix(in_oklab,var(--color-accent)_14%,transparent)] text-[var(--color-accent)]"
                      : "text-[var(--color-text-muted)] hover:bg-[var(--color-bg-soft)] hover:text-[var(--color-text)]"
                  }`}
                >
                  <span className="text-[9.5px] opacity-60">{active ? "▶" : " "}</span>
                  {p.label}
                </button>
              );
            })}
          </div>
          {/* Volume slider */}
          <div className="mt-2 pt-2 border-t border-[var(--color-border)]">
            <div className="flex items-center justify-between text-[9.5px] text-[var(--color-text-subtle)] mb-1.5">
              <span className="uppercase tracking-wider">vol</span>
              <span className="tabular-nums">{Math.round(settings.volume * 100)}</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(settings.volume * 100)}
              onChange={(e) => ambientAudio.setVolume(Number(e.target.value) / 100)}
              className="cyber-slider w-full"
            />
          </div>
        </div>
      )}
    </div>
  );
}

function WaveformIcon({ active }: { active: boolean }) {
  // 5 bars; each is a thin centered rect that scales on Y
  return (
    <svg width="14" height="11" viewBox="0 0 14 11" fill="currentColor" aria-hidden>
      {[0.5, 3, 5.5, 8, 10.5].map((x, i) => (
        <rect
          key={i}
          x={x}
          y={2}
          width={1.2}
          height={7}
          rx={0.6}
          className={active ? `wave-bar wave-bar-${i}` : ""}
          style={
            !active ? { transformBox: "fill-box", transformOrigin: "center", transform: "scaleY(0.3)" } : undefined
          }
        />
      ))}
    </svg>
  );
}
