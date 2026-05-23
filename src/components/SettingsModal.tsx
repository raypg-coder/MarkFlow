import { useEffect, useState } from "react";
import { X, CheckCircle2, AlertCircle, Loader2, Download, RotateCw } from "lucide-react";
import { useStore } from "../store";
import { listModels, type ModelInfo } from "../utils/llm";
import { checkForUpdate, downloadAndInstall, restartApp, type UpdateState } from "../utils/updater";

type Status =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ok"; models: ModelInfo[] }
  | { kind: "error"; message: string };

export function SettingsModal() {
  const { settingsOpen, setSettingsOpen, llmSettings, updateLLMSettings } = useStore();
  const [draft, setDraft] = useState(llmSettings);
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  // Re-sync draft when modal opens
  useEffect(() => {
    if (settingsOpen) {
      setDraft(llmSettings);
      setStatus({ kind: "idle" });
    }
  }, [settingsOpen, llmSettings]);

  // ESC to close
  useEffect(() => {
    if (!settingsOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSettingsOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [settingsOpen, setSettingsOpen]);

  if (!settingsOpen) return null;

  const testConnection = async () => {
    setStatus({ kind: "loading" });
    try {
      const models = await listModels(draft);
      setStatus({ kind: "ok", models });
      // Auto-pick defaults if empty and a sensible match exists
      const ids = models.map((m) => m.id);
      const pickFirstMatch = (keywords: string[], current: string) => {
        if (current && ids.includes(current)) return current;
        const hit = ids.find((id) => keywords.some((k) => id.toLowerCase().includes(k)));
        return hit ?? current;
      };
      setDraft((d) => ({
        ...d,
        chatModel: pickFirstMatch(["qwen", "minimax", "gemma", "chat"], d.chatModel),
        reasoningModel: pickFirstMatch(["mimo", "reason", "think"], d.reasoningModel),
        embedModel: pickFirstMatch(["embed", "em-", "-em"], d.embedModel),
        imageModel: pickFirstMatch(["image", "zimage", "sd", "flux", "turbo"], d.imageModel),
      }));
    } catch (e: any) {
      setStatus({ kind: "error", message: String(e?.message ?? e) });
    }
  };

  const save = () => {
    updateLLMSettings(draft);
    setSettingsOpen(false);
  };

  const ids = status.kind === "ok" ? status.models.map((m) => m.id) : [];

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 backdrop-blur-[8px]"
      onClick={() => setSettingsOpen(false)}
    >
      <div
        className="w-[520px] max-w-[92vw] max-h-[88vh] flex flex-col bg-[var(--color-bg-soft)] text-[var(--color-text)] rounded-xl overflow-hidden"
        style={{
          boxShadow: `
            inset 0 0 0 1px var(--glass-border),
            0 0 40px -8px color-mix(in oklab, var(--color-accent) 25%, transparent),
            0 32px 64px rgba(0,0,0,0.55)
          `,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--glass-border,var(--color-border))]">
          <h2 className="text-[15px] font-semibold">设置</h2>
          <button
            onClick={() => setSettingsOpen(false)}
            className="p-1.5 rounded-md hover:bg-[color-mix(in_oklab,var(--color-text)_8%,transparent)] text-[var(--color-text-muted)]"
          >
            <X size={15} strokeWidth={1.75} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-7">
          {/* LLM Service */}
          <section>
            <SectionTitle>LLM 端点</SectionTitle>
            <Field label="Base URL">
              <Input
                value={draft.baseURL}
                onChange={(v) => setDraft({ ...draft, baseURL: v })}
                placeholder="http://localhost:8000/v1"
                mono
              />
              <Hint>OpenAI 兼容端点，vLLM / sglang / Ollama (/v1)</Hint>
            </Field>
            <Field label="API Key">
              <Input
                value={draft.apiKey}
                onChange={(v) => setDraft({ ...draft, apiKey: v })}
                placeholder="可选，本地服务通常留空"
                type="password"
                mono
              />
            </Field>
            <div className="flex items-center gap-3 mt-2">
              <button
                onClick={testConnection}
                disabled={status.kind === "loading" || !draft.baseURL}
                className="px-3.5 py-1.5 text-[12.5px] rounded-lg bg-[var(--color-text)] text-[var(--color-bg)] hover:opacity-85 disabled:opacity-40"
              >
                {status.kind === "loading" ? "测试中…" : "测试连接 / 加载模型"}
              </button>
              <StatusBadge status={status} />
            </div>
          </section>

          {/* Model bindings */}
          <section>
            <SectionTitle>模型绑定</SectionTitle>
            <Field label="对话模型" hint="AI 助手默认使用">
              <ModelPicker
                value={draft.chatModel}
                onChange={(v) => setDraft({ ...draft, chatModel: v })}
                options={ids}
                placeholder="qwen3.5-27b-local"
              />
            </Field>
            <Field label="推理模型" hint="复杂任务（解释代码、长文档总结）">
              <ModelPicker
                value={draft.reasoningModel}
                onChange={(v) => setDraft({ ...draft, reasoningModel: v })}
                options={ids}
                placeholder="mimo  (可选)"
              />
            </Field>
            <Field label="嵌入模型" hint="语义检索 / 反链相似度">
              <ModelPicker
                value={draft.embedModel}
                onChange={(v) => setDraft({ ...draft, embedModel: v })}
                options={ids}
                placeholder="qwen3-em-8b"
              />
            </Field>
            <Field label="生图模型" hint="/image 命令使用">
              <ModelPicker
                value={draft.imageModel}
                onChange={(v) => setDraft({ ...draft, imageModel: v })}
                options={ids}
                placeholder="zimage-turbo-local  (可选)"
              />
            </Field>
          </section>

          <section>
            <SectionTitle>版本</SectionTitle>
            <VersionPanel />
          </section>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-[var(--glass-border,var(--color-border))] bg-[color-mix(in_oklab,var(--color-text)_3%,transparent)]">
          <button
            onClick={() => setSettingsOpen(false)}
            className="px-4 py-2 text-[12.5px] rounded-lg text-[var(--color-text-muted)] hover:bg-[color-mix(in_oklab,var(--color-text)_6%,transparent)]"
          >
            取消
          </button>
          <button
            onClick={save}
            className="px-4 py-2 text-[12.5px] rounded-lg font-medium bg-[var(--color-accent)] text-white hover:opacity-90"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}

function VersionPanel() {
  const { appVersion, updateState, setUpdateState } = useStore();

  const onCheck = async () => {
    setUpdateState({ kind: "checking" });
    try {
      const r = await checkForUpdate();
      if (!r.available) {
        setUpdateState({ kind: "uptodate", current: appVersion, checkedAt: Date.now() });
      } else {
        setUpdateState({ kind: "available", info: r.info, checkedAt: Date.now() });
      }
    } catch (e: any) {
      setUpdateState({ kind: "error", message: String(e?.message ?? e) });
    }
  };

  const onInstall = async () => {
    if (updateState.kind !== "available") return;
    const info = updateState.info;
    setUpdateState({ kind: "downloading", info, downloaded: 0, total: 0 });
    try {
      await downloadAndInstall((done, total) => {
        setUpdateState({ kind: "downloading", info, downloaded: done, total });
      });
      setUpdateState({ kind: "ready", info });
    } catch (e: any) {
      setUpdateState({ kind: "error", message: String(e?.message ?? e) });
    }
  };

  const onRestart = async () => {
    try {
      await restartApp();
    } catch (e: any) {
      setUpdateState({ kind: "error", message: String(e?.message ?? e) });
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[12px] text-[var(--color-text-muted)]">当前版本</div>
          <div className="text-[13px] font-mono text-[var(--color-text)] mt-0.5">
            v{appVersion}
            <ChannelBadge />
          </div>
        </div>
        <button
          onClick={onCheck}
          disabled={updateState.kind === "checking" || updateState.kind === "downloading"}
          className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] rounded-md bg-[var(--color-bg-soft)] hover:bg-[var(--color-bg-muted)] text-[var(--color-text)] disabled:opacity-40 font-mono"
        >
          {updateState.kind === "checking" ? (
            <>
              <Loader2 size={11} className="animate-spin" /> 检查中
            </>
          ) : (
            <>
              <RotateCw size={11} strokeWidth={1.75} /> 检查更新
            </>
          )}
        </button>
      </div>

      {/* Status row */}
      <UpdateStatus state={updateState} onInstall={onInstall} onRestart={onRestart} />
    </div>
  );
}

function ChannelBadge() {
  // Could distinguish dev/beta/stable; for now just show a static "stable" pill
  return (
    <span className="pill pill-mute ml-2" style={{ verticalAlign: "middle" }}>
      stable
    </span>
  );
}

function UpdateStatus({
  state,
  onInstall,
  onRestart,
}: {
  state: UpdateState;
  onInstall: () => void;
  onRestart: () => void;
}) {
  if (state.kind === "idle") return null;

  if (state.kind === "uptodate") {
    return (
      <div className="flex items-center gap-1.5 text-[11.5px] text-[var(--md-teal)] font-mono">
        <CheckCircle2 size={11} /> 已是最新版本
        <span className="text-[var(--color-text-subtle)] ml-1">
          · {new Date(state.checkedAt).toLocaleTimeString()}
        </span>
      </div>
    );
  }

  if (state.kind === "available") {
    return (
      <div className="rounded-md border border-[var(--color-accent)] bg-[color-mix(in_oklab,var(--color-accent)_5%,transparent)] p-2.5 space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[11.5px] font-mono text-[var(--color-accent)] uppercase tracking-wider">
            ▶ 发现新版本 v{state.info.version}
          </span>
          <button
            onClick={onInstall}
            className="flex items-center gap-1 px-3 py-1.5 text-[11px] rounded-lg font-medium font-mono bg-[var(--color-accent)] text-white hover:opacity-90"
          >
            <Download size={10} strokeWidth={2} /> 下载并安装
          </button>
        </div>
        {state.info.notes && (
          <div className="text-[11px] text-[var(--color-text-muted)] whitespace-pre-wrap max-h-[120px] overflow-y-auto font-mono leading-relaxed">
            {state.info.notes}
          </div>
        )}
        {state.info.date && (
          <div className="text-[10px] text-[var(--color-text-subtle)] font-mono">
            发布于 {state.info.date}
          </div>
        )}
      </div>
    );
  }

  if (state.kind === "downloading") {
    const pct = state.total > 0 ? (state.downloaded / state.total) * 100 : 0;
    return (
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-[11px] font-mono text-[var(--color-text-muted)]">
          <span>下载中 v{state.info.version}</span>
          <span className="tabular-nums">
            {(state.downloaded / 1024 / 1024).toFixed(1)} /{" "}
            {state.total > 0 ? (state.total / 1024 / 1024).toFixed(1) + " MB" : "?"} ·{" "}
            {pct.toFixed(0)}%
          </span>
        </div>
        <div className="h-1 bg-[var(--color-bg)] overflow-hidden rounded-md">
          <div
            className="h-full bg-[var(--color-accent)] transition-all duration-200"
            style={{
              width: `${pct}%`,
              boxShadow: "0 0 6px var(--color-accent)",
            }}
          />
        </div>
      </div>
    );
  }

  if (state.kind === "ready") {
    return (
      <div className="rounded-md border border-[var(--color-success)] bg-[color-mix(in_oklab,var(--color-success)_8%,transparent)] p-2.5 flex items-center justify-between">
        <span className="text-[11.5px] text-[var(--color-success)] font-mono">
          ✓ v{state.info.version} 已就绪，重启生效
        </span>
        <button
          onClick={onRestart}
          className="px-3 py-1.5 text-[11px] rounded-lg font-medium font-mono bg-[var(--color-success)] text-white hover:opacity-90"
        >
          立即重启
        </button>
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <div className="rounded-md border border-[var(--color-danger)] bg-[var(--md-rose-soft)] p-2.5">
        <div className="flex items-center gap-1.5 text-[11.5px] text-[var(--color-danger)] font-mono">
          <AlertCircle size={11} /> 更新失败
        </div>
        <div className="text-[11px] text-[var(--color-danger)] font-mono mt-1 break-all">
          {state.message}
        </div>
      </div>
    );
  }

  return null;
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <h3 className="text-[12.5px] font-semibold text-[var(--color-text)] tracking-tight">
        {children}
      </h3>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-3">
      <div className="flex items-baseline justify-between mb-1">
        <label className="text-[12px] text-[var(--color-text-muted)]">{label}</label>
        {hint && <span className="text-[10.5px] text-[var(--color-text-subtle)]">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return <div className="mt-1 text-[10.5px] text-[var(--color-text-subtle)]">{children}</div>;
}

function Input({
  value,
  onChange,
  placeholder,
  type,
  mono,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  mono?: boolean;
}) {
  return (
    <input
      type={type ?? "text"}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={`cyber-input w-full px-2.5 py-1.5 text-[12.5px] outline-none placeholder:text-[var(--color-text-subtle)] ${
        mono ? "font-mono" : ""
      }`}
    />
  );
}

function ModelPicker({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder?: string;
}) {
  if (options.length === 0) {
    return <Input value={value} onChange={onChange} placeholder={placeholder} mono />;
  }
  return (
    <div className="relative">
      <input
        list="model-options"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="cyber-input w-full px-2.5 py-1.5 text-[12.5px] outline-none placeholder:text-[var(--color-text-subtle)] font-mono"
      />
      <datalist id="model-options">
        {options.map((o) => (
          <option key={o} value={o} />
        ))}
      </datalist>
    </div>
  );
}

function StatusBadge({ status }: { status: Status }) {
  if (status.kind === "idle") return null;
  if (status.kind === "loading") {
    return (
      <span className="flex items-center gap-1.5 text-[11.5px] text-[var(--color-text-muted)]">
        <Loader2 size={12} className="animate-spin" />
        连接中…
      </span>
    );
  }
  if (status.kind === "ok") {
    return (
      <span className="flex items-center gap-1.5 text-[11.5px] text-[var(--md-teal)]">
        <CheckCircle2 size={12} />
        已连接 · 发现 {status.models.length} 个模型
      </span>
    );
  }
  return (
    <span
      className="flex items-center gap-1.5 text-[11.5px] text-[var(--color-danger)] truncate"
      title={status.message}
    >
      <AlertCircle size={12} />
      连接失败
    </span>
  );
}
