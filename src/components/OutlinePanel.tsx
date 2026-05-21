import { useMemo } from "react";
import { useStore } from "../store";

interface Heading {
  level: number;
  text: string;
  line: number;
}

function parseHeadings(content: string): Heading[] {
  const lines = content.split("\n");
  const headings: Heading[] = [];
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const m = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (m) {
      headings.push({ level: m[1].length, text: m[2].trim(), line: i });
    }
  }
  return headings;
}

function scrollToHeading(h: Heading) {
  const editor = document.querySelector(".milkdown .ProseMirror");
  if (!editor) return;
  const tag = `h${h.level}`;
  const els = editor.querySelectorAll<HTMLElement>(tag);
  for (const el of els) {
    if ((el.textContent ?? "").trim() === h.text) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      el.style.transition = "background-color 0.3s";
      el.style.backgroundColor = "color-mix(in oklab, var(--color-accent) 14%, transparent)";
      setTimeout(() => (el.style.backgroundColor = ""), 600);
      return;
    }
  }
}

export function OutlinePanel() {
  const { openFiles, activePath } = useStore();
  const file = openFiles.find((f) => f.path === activePath);
  const headings = useMemo(
    () => (file?.kind === "markdown" ? parseHeadings(file.content) : []),
    [file?.content, file?.kind],
  );

  const minLevel = headings.length ? Math.min(...headings.map((h) => h.level)) : 1;

  return (
    <div className="h-full flex flex-col">
      <div className="px-3 pt-3 pb-1">
        <span className="geek-label">outline</span>
      </div>
      <div className="flex-1 overflow-y-auto pb-2">
        {!file && (
          <div className="px-3 py-2 text-[12px] text-[var(--color-text-subtle)]">
            未打开任何文件
          </div>
        )}
        {file && file.kind !== "markdown" && (
          <div className="px-3 py-2 text-[12px] text-[var(--color-text-subtle)]">
            仅支持 Markdown 文件
          </div>
        )}
        {file && file.kind === "markdown" && headings.length === 0 && (
          <div className="px-3 py-2 text-[12px] text-[var(--color-text-subtle)]">
            该文档暂无标题
          </div>
        )}
        {headings.map((h, i) => (
          <button
            key={i}
            onClick={() => scrollToHeading(h)}
            className="block w-full text-left text-[12.5px] py-1 truncate text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-bg)] rounded-sm mx-1"
            style={{ paddingLeft: 10 + (h.level - minLevel) * 12, paddingRight: 10 }}
            title={h.text}
          >
            <span className={h.level === minLevel ? "text-[var(--color-text)] font-medium" : undefined}>
              {h.text}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
