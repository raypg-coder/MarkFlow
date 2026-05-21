import type { FileKind } from "../types";

export function detectKind(name: string): FileKind {
  const lower = name.toLowerCase();
  if (lower === ".env" || lower.startsWith(".env.")) return "env";
  const dot = lower.lastIndexOf(".");
  if (dot === -1) return "text";
  const ext = lower.slice(dot + 1);
  switch (ext) {
    case "md":
    case "markdown":
      return "markdown";
    case "py":
      return "python";
    case "env":
      return "env";
    case "txt":
    case "log":
      return "text";
    case "json":
      return "json";
    case "yml":
    case "yaml":
      return "yaml";
    case "toml":
    case "ini":
    case "cfg":
      return "toml";
    case "sql":
      return "sql";
    case "js":
    case "jsx":
    case "mjs":
    case "cjs":
      return "javascript";
    case "ts":
    case "tsx":
      return "typescript";
    case "go":
      return "go";
    case "css":
    case "html":
    case "rs":
    case "sh":
      return "code";
    default:
      return "unknown";
  }
}

export function isEditable(name: string): boolean {
  return detectKind(name) !== "unknown";
}
