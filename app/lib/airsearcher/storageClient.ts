/**
 * The browser's side of the local SQLite storage.
 *
 * `storage.ts` stays synchronous, as it was with localStorage, so this module
 * keeps an in-memory copy of every saved value:
 *
 *   - `storageReady()` loads the copy once per page (one GET), and on the very
 *     first run imports the browser's old localStorage values.
 *   - `getItem` reads the copy. Before the copy is loaded it returns null,
 *     exactly as localStorage returned nothing during the server render.
 *   - `setItem` updates the copy at once and sends the write in the background:
 *     one request at a time, only the newest value per key, retried until it
 *     lands. While a write is pending, leaving the page asks for confirmation.
 *   - A search's gathered flights live under records keys that are never in
 *     the copy: `setRecordsItem` queues their writes the same way, and
 *     `fetchRecordsItem` reads one search's when it is asked for.
 *
 * If the first load fails, writes are refused (as a blocked localStorage
 * refused them): a write built from the empty defaults would otherwise
 * overwrite the real saved data once the server answers again.
 */

import {
  STORAGE_FLUSH_TIMEOUT_MS,
  STORAGE_MAX_VALUE_CHARS,
  STORAGE_RETRY_DELAYS_MS,
} from "@/lib/airsearcher/config/storage";
import {
  STORAGE_KEYS,
  STORAGE_ROUTE,
  type AnyStorageKey,
  type RecordsKey,
  type StorageKey,
  type StorageSnapshot,
  type StorageValues,
} from "@/lib/airsearcher/db/keys";

type LoadState = "idle" | "loading" | "loaded" | "failed";

let state: LoadState = "idle";
let ready: Promise<void> | null = null;
const cache = new Map<StorageKey, string | null>();

/** Writes not yet confirmed by the server; the newest value per key. */
const pending = new Map<AnyStorageKey, string | null>();
let draining = false;
const idleWaiters: (() => void)[] = [];

function inBrowser(): boolean {
  return typeof window !== "undefined";
}

/* ── Loading ─────────────────────────────────────────────────────────────── */

async function getSnapshot(): Promise<StorageSnapshot> {
  const response = await fetch(STORAGE_ROUTE, { cache: "no-store" });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return (await response.json()) as StorageSnapshot;
}

/** The values the app kept in localStorage before SQLite, if any. */
function localStorageValues(): Partial<Record<StorageKey, string>> {
  const values: Partial<Record<StorageKey, string>> = {};
  try {
    for (const key of STORAGE_KEYS) {
      const value = window.localStorage?.getItem(key);
      if (typeof value === "string") values[key] = value;
    }
  } catch {
    // localStorage blocked: nothing to import.
  }
  return values;
}

/**
 * The first run's import. localStorage is only read, never changed: it stays
 * as a backup. If another tab imported first, the server says so and its
 * values are read back instead.
 */
async function importOldValues(): Promise<StorageSnapshot> {
  const response = await fetch(STORAGE_ROUTE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ values: localStorageValues() }),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return getSnapshot();
}

async function load(): Promise<void> {
  state = "loading";
  try {
    let snapshot = await getSnapshot();
    const empty = STORAGE_KEYS.every((key) => snapshot.values[key] === null);
    if (!snapshot.imported && empty) snapshot = await importOldValues();
    for (const key of STORAGE_KEYS) cache.set(key, snapshot.values[key] ?? null);
    state = "loaded";
  } catch {
    state = "failed";
  }
}

/**
 * Resolves once the saved data is loaded, or failed to load. Never rejects;
 * `storageError()` says which. Pages call it before their first read.
 */
export function storageReady(): Promise<void> {
  if (!inBrowser()) return Promise.resolve();
  return (ready ??= load());
}

/** True when the saved data couldn't be loaded, so defaults are shown. */
export function storageError(): boolean {
  return state === "failed";
}

/* ── Reading and writing ─────────────────────────────────────────────────── */

export function getItem(key: StorageKey): string | null {
  return state === "loaded" ? (cache.get(key) ?? null) : null;
}

/**
 * Returns false when the write is refused — too large, or storage unavailable —
 * just as localStorage.setItem threw, so callers can shed weight.
 */
export function setItem(key: StorageKey, value: string | null): boolean {
  if (state !== "loaded") return false;
  if (value !== null && value.length > STORAGE_MAX_VALUE_CHARS) return false;
  cache.set(key, value);
  pending.set(key, value);
  void drain();
  return true;
}

/**
 * Queues a write of one search's gathered flights (null removes them). Refused
 * like `setItem`: when too large, or before the saved data has loaded.
 */
export function setRecordsItem(key: RecordsKey, value: string | null): boolean {
  if (state !== "loaded") return false;
  if (value !== null && value.length > STORAGE_MAX_VALUE_CHARS) return false;
  pending.set(key, value);
  void drain();
  return true;
}

/** One search's gathered flights, or null when none are saved or the read failed. */
export async function fetchRecordsItem(key: RecordsKey): Promise<string | null> {
  // A write still on its way is newer than what the server holds.
  if (pending.has(key)) return pending.get(key) ?? null;
  try {
    const response = await fetch(`${STORAGE_ROUTE}?key=${encodeURIComponent(key)}`, {
      cache: "no-store",
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { value?: unknown };
    return typeof body.value === "string" ? body.value : null;
  } catch {
    return null;
  }
}

/* ── The write queue ─────────────────────────────────────────────────────── */

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Asks before leaving while a write hasn't reached the database yet. */
function onBeforeUnload(event: BeforeUnloadEvent): void {
  event.preventDefault();
  event.returnValue = "";
}

function setGuard(on: boolean): void {
  if (!inBrowser()) return;
  if (on) window.addEventListener("beforeunload", onBeforeUnload);
  else window.removeEventListener("beforeunload", onBeforeUnload);
}

/** Sends one write. "retry" for failures that may pass later. */
async function send(key: AnyStorageKey, value: string | null): Promise<"done" | "retry"> {
  try {
    const response = await fetch(STORAGE_ROUTE, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, value }),
    });
    // 400/413 will never pass: the value was checked before it was queued, so
    // this only happens if the server's rules changed. Dropped, not retried.
    if (response.ok || response.status === 400 || response.status === 413) return "done";
    return "retry";
  } catch {
    return "retry";
  }
}

async function drain(): Promise<void> {
  if (draining) return;
  draining = true;
  setGuard(true);
  let failures = 0;

  while (pending.size > 0) {
    const [key, value] = pending.entries().next().value as [AnyStorageKey, string | null];
    pending.delete(key);
    if ((await send(key, value)) === "done") {
      failures = 0;
      continue;
    }
    // Put it back unless a newer value for the key arrived meanwhile.
    if (!pending.has(key)) pending.set(key, value);
    await sleep(STORAGE_RETRY_DELAYS_MS[Math.min(failures, STORAGE_RETRY_DELAYS_MS.length - 1)]);
    failures++;
  }

  draining = false;
  setGuard(false);
  for (const resolve of idleWaiters.splice(0)) resolve();
}

/**
 * Resolves true once every write has reached the database, or false after
 * STORAGE_FLUSH_TIMEOUT_MS. Awaited before navigating to another page.
 */
export function flushStorage(timeoutMs = STORAGE_FLUSH_TIMEOUT_MS): Promise<boolean> {
  if (!draining && pending.size === 0) return Promise.resolve(true);
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), timeoutMs);
    idleWaiters.push(() => {
      clearTimeout(timer);
      resolve(true);
    });
  });
}

/* ── For the offline checks only ─────────────────────────────────────────── */

/** Puts the module in a known state: loaded with `values`, nothing pending. */
export function resetStorageClientForChecks(values: Partial<StorageValues> | null = {}): void {
  cache.clear();
  pending.clear();
  ready = null;
  state = values === null ? "idle" : "loaded";
  for (const key of STORAGE_KEYS) cache.set(key, values?.[key] ?? null);
}
