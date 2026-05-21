/**
 * Update checker — wraps `@tauri-apps/plugin-updater` with friendly state.
 *
 * Flow:
 *   1. checkForUpdate() — hits the configured endpoint, returns manifest
 *   2. If available, user clicks "install" → download + verify signature + apply
 *   3. relaunch() — restart with new binary
 */
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { getVersion } from "@tauri-apps/api/app";

export interface UpdateInfo {
  version: string;
  notes: string;
  date?: string;
}

export type UpdateState =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "uptodate"; current: string; checkedAt: number }
  | { kind: "available"; info: UpdateInfo; checkedAt: number }
  | { kind: "downloading"; info: UpdateInfo; downloaded: number; total: number }
  | { kind: "ready"; info: UpdateInfo }
  | { kind: "error"; message: string };

export async function appVersion(): Promise<string> {
  try {
    return await getVersion();
  } catch {
    return "0.0.0";
  }
}

let cached: Update | null = null;

export async function checkForUpdate(): Promise<
  | { available: false }
  | { available: true; update: Update; info: UpdateInfo }
> {
  const u = await check();
  if (!u || !u.available) {
    cached = null;
    return { available: false };
  }
  cached = u;
  return {
    available: true,
    update: u,
    info: {
      version: u.version,
      notes: u.body ?? "",
      date: u.date ?? undefined,
    },
  };
}

export async function downloadAndInstall(
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  const u = cached;
  if (!u) throw new Error("No update available — call checkForUpdate() first");
  let total = 0;
  let done = 0;
  await u.downloadAndInstall((evt) => {
    if (evt.event === "Started") {
      total = evt.data.contentLength ?? 0;
      onProgress?.(0, total);
    } else if (evt.event === "Progress") {
      done += evt.data.chunkLength;
      onProgress?.(done, total);
    } else if (evt.event === "Finished") {
      onProgress?.(total, total);
    }
  });
}

export async function restartApp(): Promise<void> {
  await relaunch();
}
