import { Settings, Moon, Sun } from "lucide-react";
import clsx from "clsx";
import { useStore } from "../store";

interface RibbonButtonProps {
  icon: React.ReactNode;
  title: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}

function RibbonButton({ icon, title, active, disabled, onClick }: RibbonButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={clsx(
        "w-7 h-7 my-0.5 flex items-center justify-center rounded transition-colors relative",
        active
          ? "bg-[var(--chrome-bg-soft)] text-[var(--chrome-accent)]"
          : "text-[var(--chrome-text-muted)] hover:bg-[var(--chrome-bg-soft)] hover:text-[var(--chrome-text)]",
        disabled && "opacity-40 cursor-not-allowed",
      )}
    >
      {icon}
    </button>
  );
}

export function Ribbon() {
  const { theme, toggleTheme, setSettingsOpen, updateState } = useStore();
  const hasUpdate = updateState.kind === "available" || updateState.kind === "ready";

  return (
    <div className="chrome-fade chrome-fade-left w-10 flex flex-col items-center py-1.5 bg-[var(--color-bg-chrome)] shrink-0">
      <div className="flex-1" />
      <RibbonButton
        icon={
          theme === "dark"
            ? <Sun size={16} strokeWidth={1.75} />
            : <Moon size={16} strokeWidth={1.75} />
        }
        onClick={toggleTheme}
        title="切换主题"
      />
      <div className="relative">
        <RibbonButton
          icon={<Settings size={16} strokeWidth={1.75} />}
          onClick={() => setSettingsOpen(true)}
          title={hasUpdate ? "设置 · 有更新可用" : "设置"}
        />
        {hasUpdate && (
          <span
            className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-[var(--color-accent)] pointer-events-none"
            style={{ boxShadow: "0 0 4px var(--color-accent)", animation: "git-mod-flash 1.6s ease-in-out infinite" }}
          />
        )}
      </div>
    </div>
  );
}
