import { STORAGE_MAX_VALUE_CHARS } from "@/lib/airsearcher/config/storage";
import {
  isRecordsKey,
  isStorageKey,
  STORAGE_KEYS,
  type StorageKey,
  type StorageSnapshot,
} from "@/lib/airsearcher/db/keys";
import { getValue, getValues, importOnce, isImported, setValue } from "@/lib/airsearcher/db/sqlite";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The app's saved data — searches, filters, preferences — in the local SQLite
 * file that replaced localStorage.
 *
 *   GET   → every key's value, and whether the one-time import has happened
 *   GET   ?key=<records key> → { value } of that one search's gathered flights,
 *           which the plain GET leaves out (see `db/records.ts`)
 *   PUT   → { key, value } saves one key (value null removes it)
 *   POST  → { values } imports the browser's old localStorage, once
 *
 * Local, single-user use only: it answers only requests addressed to
 * localhost. Errors never echo the stored data back.
 */

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

function hostnameOf(request: Request): string {
  const host = request.headers.get("host") ?? "";
  // "[::1]:3000" → "[::1]", "localhost:3000" → "localhost"
  return host.startsWith("[") ? host.slice(0, host.indexOf("]") + 1) : host.split(":")[0];
}

function reply(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

function fail(message: string, status: number): Response {
  return reply({ ok: false, error: message }, status);
}

/** Runs one database step; an unexpected failure is logged by name only. */
function guarded(step: () => Response): Response {
  try {
    return step();
  } catch (error) {
    console.error("[airsearcher/storage] database failure:", error instanceof Error ? error.name : "unknown");
    return fail("The local database couldn't be used.", 500);
  }
}

async function jsonOf(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = (await request.json()) as unknown;
    return typeof body === "object" && body !== null ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function localOnly(request: Request): Response | null {
  return LOCAL_HOSTS.has(hostnameOf(request)) ? null : fail("The storage only answers on localhost.", 403);
}

/** A value localStorage would have accepted: a string within the budget. */
function valueError(value: unknown): string | null {
  if (typeof value !== "string") return "A value must be a JSON string.";
  if (value.length > STORAGE_MAX_VALUE_CHARS) return "The value is too large.";
  return null;
}

export async function GET(request: Request) {
  const blocked = localOnly(request);
  if (blocked) return blocked;
  const key = new URL(request.url).searchParams.get("key");
  if (key !== null) {
    if (!isRecordsKey(key)) return fail("Unknown storage key.", 400);
    return guarded(() => reply({ value: getValue(key) }));
  }
  return guarded(() => reply({ values: getValues(), imported: isImported() } satisfies StorageSnapshot));
}

export async function PUT(request: Request) {
  const blocked = localOnly(request);
  if (blocked) return blocked;

  const body = await jsonOf(request);
  if (!body || !(isStorageKey(body.key) || isRecordsKey(body.key))) {
    return fail("Unknown storage key.", 400);
  }
  const key = body.key;
  if (body.value !== null) {
    const error = valueError(body.value);
    if (error) return fail(error, error.includes("large") ? 413 : 400);
  }
  return guarded(() => {
    setValue(key, body.value as string | null);
    return reply({ ok: true });
  });
}

export async function POST(request: Request) {
  const blocked = localOnly(request);
  if (blocked) return blocked;

  const body = await jsonOf(request);
  const raw = body?.values;
  if (typeof raw !== "object" || raw === null) return fail("Nothing to import.", 400);

  const values: Partial<Record<StorageKey, string>> = {};
  for (const key of STORAGE_KEYS) {
    const value = (raw as Record<string, unknown>)[key];
    if (value === undefined || value === null) continue;
    // A value localStorage held but SQLite would refuse is skipped, not fatal:
    // the rest of the import still goes through.
    if (valueError(value) === null) values[key] = value as string;
  }
  return guarded(() => reply({ imported: importOnce(values) }));
}
