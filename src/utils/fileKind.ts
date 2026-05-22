import type { FileKind } from "../types";

/** Matches all env-style config files: .env, .env.local, .env.production,
 *  .env-local, .envrc (direnv), .flaskenv. All get the env stream language. */
export function isEnvFile(name: string): boolean {
  const lower = name.toLowerCase();
  return (
    lower === ".env" ||
    lower === ".envrc" ||
    lower === ".flaskenv" ||
    lower.startsWith(".env.") ||
    lower.startsWith(".env-")
  );
}

export function detectKind(name: string): FileKind {
  const lower = name.toLowerCase();
  if (isEnvFile(lower)) return "env";
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
