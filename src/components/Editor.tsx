import { FileText } from "lucide-react";
import { useStore } from "../store";
import { CodeEditor } from "./CodeEditor";
import { MarkdownEditor } from "./MarkdownEditor";

export function Editor() {
  const { openFiles, activePath, setContent, theme } = useStore();
  const file = openFiles.find((f) => f.path === activePath);

  if (!file) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-[var(--color-text-muted)] bg-[var(--color-bg)]">
        <FileText size={40} className="opacity-15 mb-5" strokeWidth={1.25} />
        <p className="text-[13px] mb-1.5">选择左侧文件，或新建一个</p>
        <p className="text-[11.5px] text-[var(--color-text-subtle)]">
          支持 .md · .py · .js · .ts · .json · .sql · .env · .txt · .yaml
        </p>
      </div>
    );
  }

  if (file.kind === "markdown") {
    const dirty = file.content !== file.savedContent;
    return (
      <div className="flex-1 min-h-0 bg-[var(--color-bg)]">
        {/* NOTE: no `key={file.path}` — MarkdownEditor reuses its Crepe
            instance across file switches via replaceAll(). The instance
            destroy/recreate cost was the dominant file-switch latency. */}
        <MarkdownEditor
          filePath={file.path}
          fileName={file.name}
          dirty={dirty}
          theme={theme}
          value={file.content}
          onChange={(v) => setContent(file.path, v)}
        />
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 bg-[var(--color-bg)]">
      <CodeEditor
        key={file.path}
        value={file.content}
        kind={file.kind}
        theme={theme}
        onChange={(v) => setContent(file.path, v)}
      />
    </div>
  );
}
