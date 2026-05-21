import { useStore } from "../store";
import { AudioControl } from "./AudioControl";

export function StatusBar() {
  const { openFiles, activePath, appVersion, updateState } = useStore();
  const file = openFiles.find((f) => f.path === activePath);
  const updatePending = updateState.kind === "available" || updateState.kind === "ready";

  if (!file) {
    return (
      <div className="app-statusbar chrome-fade chrome-fade-bottom h-6 flex items-center px-3 text-[10.5px] gap-3">
        <span className="text-[var(--chrome-accent)] font-mono">▎</span>
        <span className="geek-label">idle</span>
        <span className="flex-1" />
        <span className="text-[var(--chrome-text-subtle)] font-mono">markflow</span>
        <span className="mx-2 text-[var(--chrome-text-subtle)] font-mono">│</span>
        <AudioControl />
      </div>
    );
  }

  const dirty = file.content !== file.savedContent;
  const lines = file.content.split("\n").length;
  const chars = file.content.length;

  return (
    <div className="app-statusbar chrome-fade chrome-fade-bottom h-6 flex items-center px-3 text-[10.5px] gap-0">
      {/* leading accent bar */}
      <span
        className="text-[var(--chrome-accent)] font-mono mr-2"
        style={{ textShadow: "0 0 6px color-mix(in oklab, var(--color-accent) 60%, transparent)" }}
      >▎</span>
      {/* path */}
      <span className="truncate flex-1 text-[var(--chrome-text-muted)]" title={file.path}>
        {file.path}
      </span>
      {/* divider */}
      <Sep />
      <span className="pill pill-info">{file.kind}</span>
      <Sep />
      <span className="mono-num text-[var(--chrome-text)]">
        {lines}
        <span className="text-[var(--chrome-text-subtle)] ml-0.5">L</span>
      </span>
      <Sep />
      <span className="mono-num text-[var(--chrome-text)]">
        {chars}
        <span className="text-[var(--chrome-text-subtle)] ml-0.5">B</span>
      </span>
      <Sep />
      {dirty ? (
        <span className="pill pill-warn">● unsaved</span>
      ) : (
        <span className="pill pill-ok">● saved</span>
      )}
      <Sep />
      <AudioControl />
      <Sep />
      <span
        className={`font-mono text-[10px] ${
          updatePending
            ? "text-[var(--color-accent)]"
            : "text-[var(--chrome-text-subtle)]"
        }`}
        title={updatePending ? "有新版本可用" : `MarkFlow v${appVersion}`}
      >
        v{appVersion}
        {updatePending && <span className="ml-1">↑</span>}
      </span>
    </div>
  );
}

function Sep() {
  return <span className="text-[var(--chrome-text-subtle)] mx-2 font-mono">│</span>;
}
