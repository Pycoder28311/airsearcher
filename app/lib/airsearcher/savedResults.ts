/**
 * Results kept with a result card's save icon, listed on the Saved page.
 *
 * Each saved result is a full copy of its arrangement, so it outlives its
 * search: removing the search, or pruning its outdated results, leaves it in
 * place. Its prices are as old as the search that found them (`foundAt`), and
 * it is outdated by the same rule as a search, judged by its own departure day.
 */

import { SAVED_RESULTS_KEY } from "@/lib/airsearcher/db/keys";
import { describeFreshness, limitForDeparture } from "@/lib/airsearcher/storage";
import { getItem, setItem } from "@/lib/airsearcher/storageClient";
import { daysBetween, isoDate } from "@/lib/airsearcher/time";
import type { Arrangement } from "@/lib/airsearcher/types";

export interface SavedResult {
  /** `savedResultId`: the search, the tab and the result. */
  id: string;
  /** When it was saved. */
  savedAt: string;
  /** When its prices were found: its search's `savedAt`. */
  foundAt: string;
  searchId: string;
  /** The search's label, kept for when the search is gone. */
  searchLabel: string;
  /** The results tab it was saved from, to open it there again. */
  source: string;
  arrangement: Arrangement;
}

/** One id per result per search and tab: the same trip saved twice is one entry. */
export function savedResultId(searchId: string, source: string, arrangement: Arrangement): string {
  return `${searchId}:${source}:${arrangement.id}`;
}

function isSavedResult(value: unknown): value is SavedResult {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Partial<SavedResult>;
  return (
    typeof item.id === "string" &&
    typeof item.foundAt === "string" &&
    typeof item.searchId === "string" &&
    typeof item.arrangement === "object" &&
    item.arrangement !== null
  );
}

/** Every saved result, newest first. */
export function loadSavedResults(): SavedResult[] {
  const raw = getItem(SAVED_RESULTS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter(isSavedResult) : [];
  } catch {
    return [];
  }
}

/** Returns false when the write was refused (too large, or storage unavailable). */
function write(list: SavedResult[]): boolean {
  return setItem(SAVED_RESULTS_KEY, JSON.stringify(list));
}

/** Adds a result, or replaces the same one saved before. */
export function addSavedResult(result: SavedResult): boolean {
  return write([result, ...loadSavedResults().filter((item) => item.id !== result.id)]);
}

export function removeSavedResult(id: string): boolean {
  return write(loadSavedResults().filter((item) => item.id !== id));
}

/** Whether a saved result's prices are too old for its departure day, or it has left. */
export function isSavedResultOutdated(result: SavedResult, now: number = Date.now()): boolean {
  const found = new Date(result.foundAt).getTime();
  if (Number.isNaN(found)) return true;
  return now - found > limitForDeparture(result.arrangement.departureDate, now);
}

/** Why it is outdated, for its label: "left 3 days ago", "more than 2 days old, …". */
export function savedResultOutdatedReason(result: SavedResult, now: number = Date.now()): string {
  const today = isoDate(new Date(now));
  const departure = result.arrangement.departureDate;
  if (departure < today) {
    const days = daysBetween(departure, today);
    return `This trip left ${days} day${days === 1 ? "" : "s"} ago`;
  }
  const days = daysBetween(today, departure);
  return `Prices more than ${describeFreshness(limitForDeparture(departure, now))} old, the limit for flights ${
    days === 0 ? "leaving today" : `${days} day${days === 1 ? "" : "s"} away`
  }`;
}
