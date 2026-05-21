/**
 * Crash-recovery swap files.
 *
 * Every dirty editor buffer is periodically (5s after last edit) flushed to
 * a swap file in appLocalDataDir/markflow/swap/<key>.swap.json. The key is
 * a base64url-encoded version of the original file path so we can recover
 * the path on next startup without a separate index.
 *
 * Lifecycle:
 *   - editor edit         → schedule swap (debounced 5s)
 *   - successful save     → delete swap
 *   - clean tab close     → delete swap
 *   - app startup         → loadAllSwaps() → restore each as a dirty tab
 *
 * Swap content always wins over disk content on restoration — if both exist,
 * we open the original path BUT replace its content with the swap, marking
 * the buffer dirty. The user can then save (which overwrites disk with
 * recovered content + deletes swap) or close (which keeps swap for next
 * recovery — letting them think it over).
 */
import { appLocalDataDir, join } from "@tauri-apps/api/path";
import { exists, mkdir, readDir, readTextFile, writeTextFile, remove } from "@tauri-apps/plugin-fs";

const SWAP_SUBDIR = "markflow/swap";

export interface SwapEntry {
  originalPath: string;
  savedAt: number;
  content: string;
}

/** Reversible URL-safe base64 encoding of a path. */
function encodePath(originalPath: string): string {
  // btoa requires ASCII; encode UTF-8 first
  const bytes = new TextEncoder().encode(originalPath);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/=+$/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

let cachedSwapDir: string | null = null;
async function ensureSwapDir(): Promise<string> {
  if (cachedSwapDir) return cachedSwapDir;
  const base = await appLocalDataDir();
  const dir = await join(base, SWAP_SUBDIR);
  try {
    if (!(await exists(dir))) await mkdir(dir, { recursive: true });
  } catch (e) {
    console.warn("[swap] ensureSwapDir failed", e);
  }
  cachedSwapDir = dir;
  return dir;
}

async function swapFilePath(originalPath: string): Promise<string> {
  const dir = await ensureSwapDir();
  return join(dir, encodePath(originalPath) + ".swap.json");
}

/** Write a swap entry to disk. Silent on failure (best-effort). */
export async function writeSwap(originalPath: string, content: string): Promise<void> {
  try {
    const file = await swapFilePath(originalPath);
    const entry: SwapEntry = { originalPath, savedAt: Date.now(), content };
    await writeTextFile(file, JSON.stringify(entry));
  } catch (e) {
    console.warn("[swap] writeSwap failed for", originalPath, e);
  }
}

/** Delete a swap entry. Silent on missing/failure. */
export async function deleteSwap(originalPath: string): Promise<void> {
  try {
    const file = await swapFilePath(originalPath);
    if (await exists(file)) await remove(file);
  } catch {
    /* silent — swap may not exist */
  }
}

/** Read all swap entries, newest first. */
export async function loadAllSwaps(): Promise<SwapEntry[]> {
  try {
    const dir = await ensureSwapDir();
    const entries = await readDir(dir);
    const swaps: SwapEntry[] = [];
    for (const e of entries) {
      const name = e.name;
      if (!name || !name.endsWith(".swap.json")) continue;
      try {
        const text = await readTextFile(await join(dir, name));
        const parsed = JSON.parse(text) as SwapEntry;
        if (
          parsed &&
          typeof parsed.originalPath === "string" &&
          typeof parsed.content === "string" &&
          typeof parsed.savedAt === "number"
        ) {
          swaps.push(parsed);
        }
      } catch (err) {
        console.warn("[swap] parse failed for", name, err);
      }
    }
    return swaps.sort((a, b) => b.savedAt - a.savedAt);
  } catch (e) {
    console.warn("[swap] loadAllSwaps failed", e);
    return [];
  }
}

// ─── Debounced per-path scheduler (used by store.setContent) ────────
const swapTimers = new Map<string, number>();
const SWAP_DEBOUNCE_MS = 5000;

/**
 * Schedule a swap write 5s after the latest call for this path.
 * Repeated calls within 5s coalesce — only the last content is written.
 */
export function scheduleSwap(originalPath: string, getContent: () => string | null): void {
  const existing = swapTimers.get(originalPath);
  if (existing != null) clearTimeout(existing);
  const t = window.setTimeout(() => {
    swapTimers.delete(originalPath);
    const content = getContent();
    if (content != null) writeSwap(originalPath, content);
  }, SWAP_DEBOUNCE_MS);
  swapTimers.set(originalPath, t);
}

/** Cancel any pending swap timer for a path (call when saved / closed). */
export function cancelSwap(originalPath: string): void {
  const existing = swapTimers.get(originalPath);
  if (existing != null) {
    clearTimeout(existing);
    swapTimers.delete(originalPath);
  }
}
