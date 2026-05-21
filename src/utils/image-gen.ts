/**
 * Generate an image via the LLM image endpoint, save to the workspace's
 * `assets/` folder, and return the markdown snippet to insert.
 */

import { writeFile, mkdir, exists } from "@tauri-apps/plugin-fs";
import { generateImage, type LLMSettings } from "./llm";

function b64ToUint8(b64: string): Uint8Array {
  const clean = b64.replace(/^data:image\/[a-z]+;base64,/i, "");
  const bin = atob(clean);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}

async function fetchAsBytes(url: string): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = await res.arrayBuffer();
  return new Uint8Array(buf);
}

function joinPath(a: string, b: string): string {
  const sep = a.includes("\\") && !a.includes("/") ? "\\" : "/";
  return a.endsWith("/") || a.endsWith("\\") ? a + b : a + sep + b;
}

function dirOf(p: string): string {
  const i = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
  return i >= 0 ? p.slice(0, i) : p;
}

/** Compute a POSIX-style relative path from `fromDir` to `toPath`. */
function relativeFrom(fromDir: string, toPath: string): string {
  const norm = (s: string) => s.replace(/\\/g, "/").replace(/\/+$/, "");
  const fromParts = norm(fromDir).split("/").filter(Boolean);
  const toParts = norm(toPath).split("/").filter(Boolean);
  let i = 0;
  while (
    i < fromParts.length &&
    i < toParts.length &&
    fromParts[i] === toParts[i]
  )
    i++;
  const ups = Array(fromParts.length - i).fill("..");
  const rel = [...ups, ...toParts.slice(i)].join("/");
  if (!rel) return ".";
  return rel.startsWith(".") ? rel : "./" + rel;
}

function escapeMarkdownAlt(s: string): string {
  return s.replace(/\]/g, "\\]").replace(/\[/g, "\\[").slice(0, 80);
}

export async function generateAndSaveImage(
  llmSettings: LLMSettings,
  prompt: string,
  workspaceRoot: string,
  activeFilePath: string,
): Promise<{ markdown: string; absPath: string }> {
  if (!llmSettings.imageModel) throw new Error("未配置生图模型");
  const result = await generateImage(llmSettings, prompt);

  let bytes: Uint8Array;
  if (result.b64) {
    bytes = b64ToUint8(result.b64);
  } else if (result.url) {
    bytes = await fetchAsBytes(result.url);
  } else {
    throw new Error("生图响应缺少 b64_json 或 url");
  }

  const assetsDir = joinPath(workspaceRoot, "assets");
  if (!(await exists(assetsDir))) {
    await mkdir(assetsDir, { recursive: true });
  }
  const ts = new Date()
    .toISOString()
    .replace(/[:.]/g, "-")
    .replace("T", "_")
    .slice(0, 19);
  const fname = `markflow-${ts}.png`;
  const absPath = joinPath(assetsDir, fname);
  await writeFile(absPath, bytes);

  const fromDir = dirOf(activeFilePath);
  const rel = relativeFrom(fromDir, absPath);
  const markdown = `\n![${escapeMarkdownAlt(prompt)}](${rel})\n`;
  return { markdown, absPath };
}
