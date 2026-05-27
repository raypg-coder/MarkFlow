import { useStore } from "../store";
import { AudioControl } from "./AudioControl";
import { downloadAndInstall, restartApp, type UpdateState } from "../utils/updater";

export function StatusBar() {
  const { openFiles, activePath, appVersion, updateState, setUpdateState } = useStore();
  const file = openFiles.find((f) => f.path === activePath);

  // Only show the font-size control when a markdown file is active
  const showFontControl = !!file && file.kind === "markdown";

  if (!file) {
    return (
      <div className="app-statusbar chrome-fade chrome-fade-bottom h-7 flex items-center px-4 text-[11px] gap-3">
        <span className="text-[var(--chrome-text-subtle)]">idle</span>
        <span className="flex-1" />
        <span className="text-[var(--chrome-text-subtle)]">MarkFlow</span>
        <Sep />
        <AudioControl />
        <Sep />
        <UpdatePill appVersion={appVersion} state={updateState} setState={setUpdateState} />
      </div>
    );
  }

  const dirty = file.content !== file.savedContent;
  const lines = file.content.split("\n").length;
  const chars = file.content.length;

  return (
    <div className="app-statusbar chrome-fade chrome-fade-bottom h-7 flex items-center px-4 text-[11px] gap-0">
      {/* file path — clean sans, muted */}
      <span className="truncate flex-1 text-[var(--chrome-text-muted)]" title={file.path}>
        {file.path}
      </span>
      <Sep />
      <span className="pill pill-info">{file.kind}</span>
      <Sep />
      <span className="text-[var(--chrome-text)] tabular-nums">
        {lines}
        <span className="text-[var(--chrome-text-subtle)] ml-0.5">L</span>
      </span>
      <Sep />
      <span className="text-[var(--chrome-text)] tabular-nums">
        {chars}
        <span className="text-[var(--chrome-text-subtle)] ml-0.5">B</span>
      </span>
      <Sep />
      {dirty ? (
        <span className="pill pill-warn">● unsaved</span>
      ) : (
        <span className="pill pill-ok">● saved</span>
      )}
      {showFontControl && (
        <>
          <Sep />
          <FontSizeControl />
        </>
      )}
      <Sep />
      <AudioControl />
      <Sep />
      <UpdatePill appVersion={appVersion} state={updateState} setState={setUpdateState} />
    </div>
  );
}

function FontSizeControl() {
  const fontSize = useStore((s) => s.editorFontSize);
  const bump = useStore((s) => s.bumpEditorFontSize);
  const reset = useStore((s) => s.resetEditorFontSize);
  return (
    <span className="flex items-center gap-0.5" title="字体大小 (⌘+ / ⌘- / ⌘0)">
      <button
        onClick={() => bump(-1)}
        className="px-1 rounded text-[var(--chrome-text-muted)] hover:text-[var(--chrome-text)] hover:bg-[color-mix(in_oklab,var(--color-text)_8%,transparent)] text-[12px] leading-none"
      >
        A−
      </button>
      <button
        onClick={reset}
        className="px-1 text-[var(--chrome-text)] tabular-nums hover:text-[var(--chrome-accent)]"
        title="重置 (⌘0)"
      >
        {fontSize}
      </button>
      <button
        onClick={() => bump(1)}
        className="px-1 rounded text-[var(--chrome-text-muted)] hover:text-[var(--chrome-text)] hover:bg-[color-mix(in_oklab,var(--color-text)_8%,transparent)] text-[13px] leading-none"
      >
        A+
      </button>
    </span>
  );
}

function Sep() {
  return <span className="text-[var(--chrome-text-subtle)] mx-2.5 opacity-40">·</span>;
}

/**
 * Version pill — clickable when an update is available.
 *
 *  uptodate / idle / error : `v0.1.0`            (muted, non-interactive)
 *  available               : `v0.1.0 → v0.2.0 ↓` (accent + pulse, click → download)
 *  downloading             : `↓ 45%`              (accent, live progress)
 *  ready                   : `↻ restart`          (accent + pulse, click → relaunch)
 */
function UpdatePill({
  appVersion,
  state,
  setState,
}: {
  appVersion: string;
  state: UpdateState;
  setState: (s: UpdateState) => void;
}) {
  if (state.kind === "available") {
    const info = state.info;
    const onClick = async () => {
      setState({ kind: "downloading", info, downloaded: 0, total: 0 });
      try {
        await downloadAndInstall((done, total) => {
          setState({ kind: "downloading", info, downloaded: done, total });
        });
        setState({ kind: "ready", info });
      } catch (e: any) {
        setState({ kind: "error", message: String(e?.message ?? e) });
      }
    };
    return (
      <button
        onClick={onClick}
        className="update-pill text-[10.5px] px-2 py-0.5 rounded-full text-[var(--color-accent)] hover:bg-[color-mix(in_oklab,var(--color-accent)_14%,transparent)] tabular-nums"
        title={`新版本 v${info.version} 可用 — 点击下载并安装`}
        style={{
          animation: "update-pulse 2s ease-in-out infinite",
          boxShadow: "inset 0 0 0 1px color-mix(in oklab, var(--color-accent) 35%, transparent)",
        }}
      >
        v{appVersion}
        <span className="mx-1 opacity-60">→</span>
        v{info.version}
        <span className="ml-1">↓</span>
      </button>
    );
  }

  if (state.kind === "downloading") {
    const pct = state.total > 0 ? Math.floor((state.downloaded / state.total) * 100) : 0;
    return (
      <span
        className="text-[10.5px] text-[var(--color-accent)] px-2 tabular-nums"
        title={`正在下载 v${state.info.version}…`}
      >
        ↓ {pct}%
      </span>
    );
  }

  if (state.kind === "ready") {
    return (
      <button
        onClick={() => restartApp().catch(() => {})}
        className="update-pill text-[10.5px] px-2 py-0.5 rounded-full text-[var(--color-accent)] hover:bg-[color-mix(in_oklab,var(--color-accent)_14%,transparent)]"
        title={`v${state.info.version} 已就绪 — 点击重启应用`}
        style={{
          animation: "update-pulse 1.6s ease-in-out infinite",
          boxShadow: "inset 0 0 0 1px color-mix(in oklab, var(--color-accent) 50%, transparent)",
        }}
      >
        ↻ restart
      </button>
    );
  }

  // Default: idle / checking / uptodate / error → quiet version label
  return (
    <span
      className="text-[10.5px] text-[var(--chrome-text-subtle)] tabular-nums"
      title={
        state.kind === "checking"
          ? "正在检查更新…"
          : state.kind === "error"
          ? `更新检查失败：${state.message}`
          : `MarkFlow v${appVersion}`
      }
    >
      v{appVersion}
    </span>
  );
}
