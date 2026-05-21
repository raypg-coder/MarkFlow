/**
 * Per-path debounced auto-save scheduler.
 *
 * setContent → scheduleAutosave(path) (debounced 1s)
 * On timer fire, calls a provided save callback (typically the store's
 * saveFile). Repeated edits coalesce — save fires 1s after last edit.
 *
 * Window blur additionally triggers an immediate flush of all pending
 * timers (handled by the consumer wiring in App.tsx).
 */

const timers = new Map<string, number>();
const AUTOSAVE_DEBOUNCE_MS = 1000;

let saveImpl: ((path: string) => Promise<void> | void) | null = null;

/** Wire up the actual save function. Called once at app startup. */
export function setAutosaveImpl(fn: (path: string) => Promise<void> | void): void {
  saveImpl = fn;
}

/** Schedule a save 1s after the latest call for this path. */
export function scheduleAutosave(path: string): void {
  if (!saveImpl) return; // not wired yet
  const existing = timers.get(path);
  if (existing != null) clearTimeout(existing);
  const t = window.setTimeout(() => {
    timers.delete(path);
    Promise.resolve(saveImpl!(path)).catch((e) => {
      console.warn("[autosave] save failed for", path, e);
    });
  }, AUTOSAVE_DEBOUNCE_MS);
  timers.set(path, t);
}

/** Cancel a pending auto-save (e.g., file closed or explicit save). */
export function cancelAutosave(path: string): void {
  const existing = timers.get(path);
  if (existing != null) {
    clearTimeout(existing);
    timers.delete(path);
  }
}

/** Fire any pending auto-save timers immediately. Used on window blur. */
export function flushAllAutosaves(): void {
  const paths = Array.from(timers.keys());
  for (const p of paths) {
    cancelAutosave(p);
    if (saveImpl) {
      Promise.resolve(saveImpl(p)).catch((e) => {
        console.warn("[autosave] flush save failed for", p, e);
      });
    }
  }
}
