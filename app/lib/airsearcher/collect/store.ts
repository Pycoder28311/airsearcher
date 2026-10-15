/**
 * The answers the user's own browser caught and sent over. Server-only.
 *
 * When the user opens a search's link in their browser and clicks "View more
 * flights", the collector extension copies the GetShoppingResults answer and
 * posts it here. It is kept in memory, filed by the search it answers (the
 * airports and the date), until the dashboard asks for it. Nothing here
 * contacts Google.
 */

import { decodeSearch, freqOf } from "@/lib/airsearcher/curl/freq";

if (typeof window !== "undefined") {
  throw new Error("collect/store.ts is server-only.");
}

/** How long an answer waits to be asked for. */
const KEEP_MS = 60 * 60 * 1000;
/** Searches kept at once; the oldest go first. */
const KEEP_MAX = 500;

interface Answer {
  body: string;
  at: number;
}

interface Entry {
  /** The first page, as a new search returns it. */
  first?: Answer;
  /** The full list, as "View more flights" returns it. */
  all?: Answer;
}

const globalStore = globalThis as typeof globalThis & {
  __airsearcherCollected?: Map<string, Entry>;
};
const answers = (globalStore.__airsearcherCollected ??= new Map<string, Entry>());

/** Requests waiting for a search's answer, woken when one arrives. */
const waiting = new Map<string, Set<() => void>>();

/** The same key for the browser's request and the dashboard's search. */
export function collectKey(from: string[], to: string[], date: string | null): string {
  return `${[...from].sort().join(",")}>${[...to].sort().join(",")}@${date ?? ""}`;
}

/** `search[3]` of a GetShoppingResults body: 0 first page, 1 "View more flights". */
function listFlagOf(requestBody: string): number | null {
  const freq = freqOf(requestBody);
  if (!freq) return null;
  try {
    const outer = JSON.parse(freq) as unknown[];
    const search = JSON.parse(String(outer[1])) as unknown[];
    return typeof search[3] === "number" ? search[3] : null;
  } catch {
    return null;
  }
}

/** Why a request couldn't be read as a flight search, without quoting any of it. */
export function explainRequest(requestBody: string): string {
  const freq = freqOf(requestBody);
  if (!freq) return "the request has no f.req field";
  let outer: unknown;
  try {
    outer = JSON.parse(freq);
  } catch {
    return "f.req isn't JSON";
  }
  if (!Array.isArray(outer) || typeof outer[1] !== "string") return "f.req isn't the expected [null, \"…\"] pair";
  let search: unknown;
  try {
    search = JSON.parse(outer[1]);
  } catch {
    return "the inner search isn't JSON";
  }
  if (!Array.isArray(search) || !Array.isArray(search[1])) return "the inner search has no settings list";
  const legs = (search[1] as unknown[])[13];
  if (!Array.isArray(legs) || legs.length === 0) return "the settings have no legs (position 13)";
  return "the first leg has no airports or date";
}

function prune(now: number): void {
  for (const [key, entry] of answers) {
    const newest = Math.max(entry.first?.at ?? 0, entry.all?.at ?? 0);
    if (now - newest > KEEP_MS) answers.delete(key);
  }
  while (answers.size > KEEP_MAX) {
    const oldest = answers.keys().next().value;
    if (oldest === undefined) break;
    answers.delete(oldest);
  }
}

/** Files one caught answer under its search. Null when the request isn't a flight search. */
export function putAnswer(requestBody: string, responseBody: string): { key: string; list: "first" | "all" } | null {
  const leg = decodeSearch(requestBody)?.legs[0];
  if (!leg) return null;
  const key = collectKey(leg.from, leg.to, leg.date);
  const list = listFlagOf(requestBody) === 1 ? "all" : "first";
  const now = Date.now();
  prune(now);
  // Re-inserted, so the newest search is last in the map.
  const entry = answers.get(key) ?? {};
  answers.delete(key);
  entry[list] = { body: responseBody, at: now };
  answers.set(key, entry);
  for (const wake of waiting.get(key) ?? []) wake();
  return { key, list };
}

export type Collected =
  | { state: "waiting" }
  /** Only the first page has come; the full list has not. */
  | { state: "first" }
  | { state: "done"; list: "first" | "all"; body: string };

/**
 * What has arrived for a search. The full list finishes it; the first page
 * does only when `acceptFirst` is set. A finished answer is handed over once.
 */
export function takeAnswer(key: string, acceptFirst: boolean): Collected {
  prune(Date.now());
  const entry = answers.get(key);
  if (entry?.all) {
    answers.delete(key);
    return { state: "done", list: "all", body: entry.all.body };
  }
  if (entry?.first) {
    if (!acceptFirst) return { state: "first" };
    answers.delete(key);
    return { state: "done", list: "first", body: entry.first.body };
  }
  return { state: "waiting" };
}

/** Holds until an answer for `key` arrives, `timeoutMs` passes or `signal` aborts. */
export function waitForChange(key: string, timeoutMs: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const wakers = waiting.get(key) ?? new Set<() => void>();
    waiting.set(key, wakers);
    const done = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", done);
      wakers.delete(done);
      if (wakers.size === 0) waiting.delete(key);
      resolve();
    };
    const timer = setTimeout(done, timeoutMs);
    wakers.add(done);
    signal.addEventListener("abort", done, { once: true });
  });
}
