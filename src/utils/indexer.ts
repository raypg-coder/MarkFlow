/**
 * Semantic vector index — chunk markdown, embed, store, search.
 * Storage: localStorage (one key per workspace fingerprint).
 * Search: cosine similarity in JS.
 */

import { readTextFile, writeTextFile, mkdir, exists } from "@tauri-apps/plugin-fs";
import { appLocalDataDir, join } from "@tauri-apps/api/path";
import { embed, type LLMSettings } from "./llm";
import type { FileNode } from "../types";

export interface IndexChunk {
  path: string;
  chunkIdx: number;
  snippet: string;
  vec: number[];
  mtime: number; // millis since epoch; 0 if unknown (legacy)
}

export interface MdFileMeta {
  path: string;
  mtime: number;
  size: number;
}

export interface ScoredHit {
  chunk: IndexChunk;
  score: number;
}

export interface IndexProgress {
  done: number;
  total: number;
  phase: "scanning" | "embedding" | "saving" | "done";
  /** Total files in workspace this rebuild; only meaningful in incremental mode */
  fileTotal?: number;
  /** Files that needed re-embed in this rebuild */
  fileChanged?: number;
}

export interface IndexDiff {
  toReindex: MdFileMeta[];
  removed: string[];
  kept: number;
}

const LS_KEY = "vidx:v1"; // legacy, for migration
const INDEX_FILENAME = "index.json";
const INDEX_DIR = "markflow";

async function indexPath(): Promise<string> {
  const base = await appLocalDataDir();
  const dir = await join(base, INDEX_DIR);
  return join(dir, INDEX_FILENAME);
}

async function ensureIndexDir(): Promise<void> {
  const base = await appLocalDataDir();
  const dir = await join(base, INDEX_DIR);
  try {
    if (!(await exists(dir))) {
      await mkdir(dir, { recursive: true });
    }
  } catch (e) {
    console.warn("ensureIndexDir failed", e);
  }
}

/** Async load — disk first, then migrate from localStorage if present. */
export async function loadIndex(): Promise<IndexChunk[]> {
  // Try disk first
  try {
    const p = await indexPath();
    if (await exists(p)) {
      const raw = await readTextFile(p);
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {
    console.warn("loadIndex from disk failed", e);
  }
  // Fallback: migrate from localStorage
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        await saveIndex(parsed);
        localStorage.removeItem(LS_KEY);
        return parsed;
      }
    }
  } catch {
    /* ignore */
  }
  return [];
}

export async function saveIndex(chunks: IndexChunk[]): Promise<void> {
  try {
    await ensureIndexDir();
    const p = await indexPath();
    await writeTextFile(p, JSON.stringify(chunks));
  } catch (e) {
    console.error("saveIndex failed", e);
    throw e;
  }
}

export async function clearIndex(): Promise<void> {
  try {
    await saveIndex([]);
  } catch {
    /* ignore */
  }
  localStorage.removeItem(LS_KEY);
}

/** Recursively collect markdown paths from a file tree. */
export function collectMdPaths(node: FileNode, out: string[] = []): string[] {
  if (!node.is_dir) {
    const n = node.name.toLowerCase();
    if (n.endsWith(".md") || n.endsWith(".markdown")) out.push(node.path);
  } else if (node.children) {
    for (const c of node.children) collectMdPaths(c, out);
  }
  return out;
}

/**
 * Split markdown content into ~maxChars-sized chunks on paragraph boundaries.
 * Skips frontmatter blocks but keeps everything else (code blocks included —
 * embedding still benefits from semantic context around code).
 */
export function chunkMarkdown(content: string, maxChars = 1500): string[] {
  // Strip leading frontmatter
  let body = content;
  if (body.startsWith("---\n")) {
    const end = body.indexOf("\n---", 4);
    if (end > 0) body = body.slice(end + 4).trimStart();
  }

  const paras = body.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const chunks: string[] = [];
  let cur = "";
  for (const p of paras) {
    const sep = cur ? "\n\n" : "";
    if (cur.length + sep.length + p.length <= maxChars) {
      cur += sep + p;
    } else {
      if (cur) chunks.push(cur);
      if (p.length > maxChars) {
        for (let i = 0; i < p.length; i += maxChars) {
          chunks.push(p.slice(i, i + maxChars));
        }
        cur = "";
      } else {
        cur = p;
      }
    }
  }
  if (cur) chunks.push(cur);
  return chunks;
}

export function cosine(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  let dot = 0,
    na = 0,
    nb = 0;
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/** Cosine top-K across chunks. */
export function searchVec(
  chunks: IndexChunk[],
  qVec: number[],
  k = 10,
  excludePath?: string,
): ScoredHit[] {
  const scored: ScoredHit[] = [];
  for (const c of chunks) {
    if (excludePath && c.path === excludePath) continue;
    scored.push({ chunk: c, score: cosine(c.vec, qVec) });
  }
  scored.sort((a, b) => b.score - a.score);
  // Deduplicate by path (keep best chunk per file)
  const seen = new Set<string>();
  const out: ScoredHit[] = [];
  for (const s of scored) {
    if (seen.has(s.chunk.path)) continue;
    seen.add(s.chunk.path);
    out.push(s);
    if (out.length >= k) break;
  }
  return out;
}

/**
 * Diff the existing index against current metas:
 *   - toReindex: files that are new OR whose mtime advanced
 *   - removed:   paths in index but no longer on disk
 *   - kept:      number of files whose chunks we'll preserve as-is
 */
export function diffIndex(existing: IndexChunk[], metas: MdFileMeta[]): IndexDiff {
  const currentByPath = new Map<string, MdFileMeta>();
  for (const m of metas) currentByPath.set(m.path, m);

  const existingByPath = new Map<string, number>(); // path -> max mtime seen
  for (const c of existing) {
    const cur = existingByPath.get(c.path);
    if (cur === undefined || c.mtime > cur) existingByPath.set(c.path, c.mtime);
  }

  const toReindex: MdFileMeta[] = [];
  for (const m of metas) {
    const known = existingByPath.get(m.path);
    if (known === undefined || known < m.mtime || known === 0) {
      toReindex.push(m);
    }
  }

  const removed: string[] = [];
  for (const p of existingByPath.keys()) {
    if (!currentByPath.has(p)) removed.push(p);
  }

  const kept = existingByPath.size - toReindex.length - removed.length;
  return { toReindex, removed, kept: Math.max(kept, 0) };
}

async function embedFiles(
  metas: MdFileMeta[],
  llmSettings: LLMSettings,
  onProgress?: (p: IndexProgress) => void,
  signal?: AbortSignal,
  fileTotal?: number,
): Promise<IndexChunk[]> {
  onProgress?.({
    done: 0,
    total: metas.length,
    phase: "scanning",
    fileTotal,
    fileChanged: metas.length,
  });
  const allChunks: { path: string; idx: number; text: string; mtime: number }[] = [];
  for (let i = 0; i < metas.length; i++) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    try {
      const content = await readTextFile(metas[i].path);
      const parts = chunkMarkdown(content);
      parts.forEach((text, idx) =>
        allChunks.push({ path: metas[i].path, idx, text, mtime: metas[i].mtime }),
      );
    } catch (e) {
      console.warn("indexer: failed to read", metas[i].path, e);
    }
    onProgress?.({
      done: i + 1,
      total: metas.length,
      phase: "scanning",
      fileTotal,
      fileChanged: metas.length,
    });
  }

  const out: IndexChunk[] = [];
  const BATCH = 32;
  for (let i = 0; i < allChunks.length; i += BATCH) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const batch = allChunks.slice(i, i + BATCH);
    const vecs = await embed(
      llmSettings,
      batch.map((b) => b.text),
      { signal },
    );
    batch.forEach((b, j) =>
      out.push({
        path: b.path,
        chunkIdx: b.idx,
        snippet: b.text.slice(0, 220).replace(/\s+/g, " ").trim(),
        vec: vecs[j],
        mtime: b.mtime,
      }),
    );
    onProgress?.({
      done: Math.min(i + BATCH, allChunks.length),
      total: allChunks.length,
      phase: "embedding",
      fileTotal,
      fileChanged: metas.length,
    });
  }
  return out;
}

/** Full rebuild — re-embed everything. */
export async function rebuildIndexFull(
  metas: MdFileMeta[],
  llmSettings: LLMSettings,
  onProgress?: (p: IndexProgress) => void,
  signal?: AbortSignal,
): Promise<IndexChunk[]> {
  const out = await embedFiles(metas, llmSettings, onProgress, signal, metas.length);
  onProgress?.({ done: out.length, total: out.length, phase: "saving" });
  await saveIndex(out);
  onProgress?.({ done: out.length, total: out.length, phase: "done" });
  return out;
}

/** Incremental rebuild — only re-embed files whose mtime advanced; drop deleted. */
export async function rebuildIndexIncremental(
  metas: MdFileMeta[],
  existing: IndexChunk[],
  llmSettings: LLMSettings,
  onProgress?: (p: IndexProgress) => void,
  signal?: AbortSignal,
): Promise<IndexChunk[]> {
  const diff = diffIndex(existing, metas);
  const removedSet = new Set(diff.removed);
  const reindexSet = new Set(diff.toReindex.map((m) => m.path));

  // Keep chunks that are NOT removed and NOT being re-indexed
  const kept = existing.filter(
    (c) => !removedSet.has(c.path) && !reindexSet.has(c.path),
  );

  if (diff.toReindex.length === 0) {
    onProgress?.({
      done: 0,
      total: 0,
      phase: "saving",
      fileTotal: metas.length,
      fileChanged: 0,
    });
    await saveIndex(kept);
    onProgress?.({ done: 0, total: 0, phase: "done", fileTotal: metas.length, fileChanged: 0 });
    return kept;
  }

  const fresh = await embedFiles(diff.toReindex, llmSettings, onProgress, signal, metas.length);
  const merged = [...kept, ...fresh];
  onProgress?.({
    done: fresh.length,
    total: fresh.length,
    phase: "saving",
    fileTotal: metas.length,
    fileChanged: diff.toReindex.length,
  });
  await saveIndex(merged);
  onProgress?.({
    done: fresh.length,
    total: fresh.length,
    phase: "done",
    fileTotal: metas.length,
    fileChanged: diff.toReindex.length,
  });
  return merged;
}
