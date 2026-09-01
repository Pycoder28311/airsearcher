/**
 * Date and duration helpers.
 *
 * Everything here is pure and works on ISO "YYYY-MM-DD" strings or on the
 * "YYYY-MM-DD HH:MM" local-time strings the flight shapes use. No Date object
 * is ever mutated.
 */

/** "YYYY-MM-DD" for a Date, in local time. */
export function isoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Parses "YYYY-MM-DD" into a local-midnight Date. Returns null when unusable. */
export function parseIsoDate(iso: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

/** A new ISO date `days` after `iso`. Returns `iso` unchanged when unparseable. */
export function addDays(iso: string, days: number): string {
  const date = parseIsoDate(iso);
  if (!date) return iso;
  date.setDate(date.getDate() + days);
  return isoDate(date);
}

/** Whole days from `from` to `to`; negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  const a = parseIsoDate(from);
  const b = parseIsoDate(to);
  if (!a || !b) return 0;
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

/** Every ISO date from `start` to `end` inclusive. Empty when the range is backwards. */
export function eachDayInRange(start: string, end: string): string[] {
  const span = daysBetween(start, end);
  if (span < 0) return [];
  const days: string[] = [];
  for (let i = 0; i <= span; i++) days.push(addDays(start, i));
  return days;
}

/** The full "YYYY-MM-DD HH:MM" value as a local Date, or null. */
export function parseFlightTime(time: string | null | undefined): Date | null {
  if (typeof time !== "string") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})/.exec(time.trim());
  if (!match) return null;
  const date = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4]),
    Number(match[5]),
  );
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Minutes from one flight time to another; null when either is unusable. */
export function minutesBetweenTimes(
  from: string | null | undefined,
  to: string | null | undefined,
): number | null {
  const a = parseFlightTime(from);
  const b = parseFlightTime(to);
  if (!a || !b) return null;
  return Math.round((b.getTime() - a.getTime()) / 60_000);
}

/** "HH:MM" from a flight time string, or an em dash when there is none. */
export function formatClock(time: string | null | undefined): string {
  const match = /(\d{1,2}):(\d{2})\s*$/.exec((time ?? "").trim());
  if (!match) return "—";
  return `${match[1].padStart(2, "0")}:${match[2]}`;
}

/** "2h 45m" from a minute count. */
export function formatDuration(minutes: number | null | undefined): string {
  if (typeof minutes !== "number" || !Number.isFinite(minutes)) return "—";
  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes % 60);
  if (hours === 0) return `${rest}m`;
  if (rest === 0) return `${hours}h`;
  return `${hours}h ${rest}m`;
}

/** "14:00" from a whole hour, for the time-window sliders. */
export function formatHour(hour: number): string {
  return `${String(Math.floor(hour)).padStart(2, "0")}:00`;
}

/** "3 hours ago" / "2 days ago", for the search history. */
export function formatAge(isoTimestamp: string, now: number = Date.now()): string {
  const then = new Date(isoTimestamp).getTime();
  if (Number.isNaN(then)) return "unknown";

  const minutes = Math.max(0, Math.round((now - then) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;

  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

/** "14 Sep 2026" from an ISO date. */
export function formatDate(iso: string | null): string {
  const date = iso ? parseIsoDate(iso) : null;
  if (!date) return "—";
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
