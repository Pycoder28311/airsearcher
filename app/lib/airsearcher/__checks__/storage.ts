/**
 * Offline checks for the local SQLite storage.
 *
 * Run with `npx tsx app/lib/airsearcher/__checks__/storage.ts`. The database
 * checks use a temporary file that is deleted afterwards; the browser checks
 * stub `fetch` and `window`. Nothing touches the real database or the network.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { STORAGE_MAX_VALUE_CHARS } from "@/lib/airsearcher/config/storage";
import { FILTERS_KEY, PREFS_KEY, recordsKeyOf, SEARCHES_KEY } from "@/lib/airsearcher/db/keys";
import {
  getValue,
  getValues,
  importOnce,
  isImported,
  openDb,
  separateRecords,
  setValue,
} from "@/lib/airsearcher/db/sqlite";
import {
  describeFreshness,
  freshnessLimitMs,
  gatheredFlightsOf,
  isStale,
  loadFilters,
  loadGatheredFlights,
  loadSearches,
  pruneOutdatedResults,
  removeSearch,
  saveSearch,
  type StoredSearch,
} from "@/lib/airsearcher/storage";
import { asCurlError, CurlError } from "@/lib/airsearcher/curl/errors";
import { extendCurlSearch } from "@/lib/airsearcher/search";
import { DEFAULT_FILTERS } from "@/lib/airsearcher/config/filters";
import { DEFAULT_RANKING_CONFIG } from "@/lib/airsearcher/config/ranking";
import type { FlightRecord } from "@/lib/airsearcher/types";
import {
  flushStorage,
  getItem,
  resetStorageClientForChecks,
  setItem,
  storageError,
  storageReady,
} from "@/lib/airsearcher/storageClient";

let passed = 0;
async function check(name: string, fn: () => void | Promise<void>): Promise<void> {
  try {
    await fn();
    passed++;
    console.log(`  ok  ${name}`);
  } catch (error) {
    console.error(`FAIL  ${name}`);
    throw error;
  }
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "airsearch-storage-"));
const tempDb = (name: string) => openDb(path.join(dir, name, "airsearch.sqlite"));

/* ── A fake storage server for the browser checks ────────────────────────── */

interface FakeServer {
  values: Record<string, string | null>;
  imported: boolean;
  puts: { key: string; value: string | null }[];
  /** PUTs that fail (network error) before one succeeds. */
  failPuts: number;
  down: boolean;
}

function fakeServer(initial: Partial<FakeServer> = {}): FakeServer {
  const server: FakeServer = {
    values: { [SEARCHES_KEY]: null, [FILTERS_KEY]: null, [PREFS_KEY]: null },
    imported: true,
    puts: [],
    failPuts: 0,
    down: false,
    ...initial,
  };
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    if (server.down) throw new TypeError("fetch failed");
    const method = init?.method ?? "GET";
    const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
    const key = new URL(url, "http://localhost").searchParams.get("key");
    if (method === "GET" && key !== null) return json({ value: server.values[key] ?? null });
    if (method === "GET") return json({ values: server.values, imported: server.imported });
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    if (method === "POST") {
      const values = body.values as Record<string, string>;
      if (!server.imported) Object.assign(server.values, values);
      const did = !server.imported;
      server.imported = true;
      return json({ imported: did });
    }
    if (server.failPuts > 0) {
      server.failPuts--;
      throw new TypeError("fetch failed");
    }
    server.puts.push({ key: body.key as string, value: body.value as string | null });
    server.values[body.key as string] = body.value as string | null;
    return json({ ok: true });
  }) as typeof fetch;
  return server;
}

const listeners = new Set<string>();
function fakeWindow(local: Record<string, string> = {}): void {
  (globalThis as { window?: unknown }).window = {
    localStorage: { getItem: (key: string) => local[key] ?? null },
    addEventListener: (name: string) => listeners.add(name),
    removeEventListener: (name: string) => listeners.delete(name),
  };
}

async function main() {
  /* ── The database ───────────────────────────────────────────────────────── */

  await check("a new database gets the schema once, in WAL mode", () => {
    const db = tempDb("schema");
    assert.equal(db.pragma("user_version", { simple: true }), 1);
    assert.equal(db.pragma("journal_mode", { simple: true }), "wal");
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all();
    assert.deepEqual(tables, [{ name: "kv" }, { name: "meta" }]);
    db.close();
    // Reopening an existing file keeps it as it is.
    const again = tempDb("schema");
    assert.equal(again.pragma("user_version", { simple: true }), 1);
    again.close();
  });

  await check("values round-trip exactly; null removes a key", () => {
    const db = tempDb("roundtrip");
    const json = JSON.stringify({ text: "Αθήνα → London", n: 1 });
    setValue(FILTERS_KEY, json, db);
    assert.equal(getValues(db)[FILTERS_KEY], json);
    assert.equal(getValues(db)[SEARCHES_KEY], null);
    setValue(FILTERS_KEY, "[]", db);
    assert.equal(getValues(db)[FILTERS_KEY], "[]");
    setValue(FILTERS_KEY, null, db);
    assert.equal(getValues(db)[FILTERS_KEY], null);
    db.close();
  });

  await check("the import runs once, only into an empty database", () => {
    const db = tempDb("import");
    assert.equal(isImported(db), false);
    assert.equal(importOnce({ [SEARCHES_KEY]: "[1]", [PREFS_KEY]: "{}" }, db), true);
    assert.equal(isImported(db), true);
    assert.equal(getValues(db)[SEARCHES_KEY], "[1]");
    assert.equal(importOnce({ [SEARCHES_KEY]: "[2]" }, db), false);
    assert.equal(getValues(db)[SEARCHES_KEY], "[1]");

    const used = tempDb("import-used");
    setValue(FILTERS_KEY, "{}", used);
    assert.equal(importOnce({ [SEARCHES_KEY]: "[1]" }, used), false);
    assert.equal(getValues(used)[SEARCHES_KEY], null);

    // Nothing to import still marks it done, so it is never retried.
    const empty = tempDb("import-empty");
    assert.equal(importOnce({}, empty), true);
    assert.equal(isImported(empty), true);
    for (const d of [db, used, empty]) d.close();
  });

  /* ── The browser client ─────────────────────────────────────────────────── */

  await check("before the data is loaded, reads are empty and writes refused", () => {
    resetStorageClientForChecks(null);
    assert.equal(getItem(SEARCHES_KEY), null);
    assert.equal(setItem(SEARCHES_KEY, "[]"), false);
    assert.deepEqual(loadSearches(), []);
    assert.equal(loadFilters().type, "round-trip");
  });

  await check("a write over the size budget is refused, as localStorage refused it", () => {
    resetStorageClientForChecks({});
    fakeServer();
    assert.equal(setItem(SEARCHES_KEY, "x".repeat(STORAGE_MAX_VALUE_CHARS + 1)), false);
    assert.equal(getItem(SEARCHES_KEY), null);
  });

  await check("writes update reads at once, collapse per key, and reach the server", async () => {
    resetStorageClientForChecks({});
    fakeWindow();
    const server = fakeServer();
    assert.equal(setItem(FILTERS_KEY, '{"a":1}'), true);
    assert.equal(setItem(FILTERS_KEY, '{"a":2}'), true);
    assert.equal(setItem(FILTERS_KEY, '{"a":3}'), true);
    assert.equal(getItem(FILTERS_KEY), '{"a":3}');
    assert.equal(listeners.has("beforeunload"), true, "leaving asks while a write is pending");
    assert.equal(await flushStorage(), true);
    assert.equal(server.values[FILTERS_KEY], '{"a":3}');
    // The first write was already in flight; the two after it became one.
    assert.deepEqual(server.puts.map((p) => p.value), ['{"a":1}', '{"a":3}']);
    assert.equal(listeners.has("beforeunload"), false);
  });

  await check("a failed write is retried until it lands", async () => {
    resetStorageClientForChecks({});
    fakeWindow();
    const server = fakeServer({ failPuts: 1 });
    setItem(PREFS_KEY, '{"p":1}');
    assert.equal(await flushStorage(5_000), true);
    assert.equal(server.values[PREFS_KEY], '{"p":1}');
  });

  await check("the first load imports the old localStorage values, once", async () => {
    resetStorageClientForChecks(null);
    fakeWindow({ [SEARCHES_KEY]: "[]", [FILTERS_KEY]: '{"old":true}' });
    const server = fakeServer({ imported: false });
    await storageReady();
    assert.equal(storageError(), false);
    assert.equal(getItem(FILTERS_KEY), '{"old":true}');
    assert.equal(server.values[FILTERS_KEY], '{"old":true}');
    assert.equal(server.imported, true);
  });

  await check("an unreachable server shows defaults and refuses writes", async () => {
    resetStorageClientForChecks(null);
    fakeWindow();
    fakeServer({ down: true });
    await storageReady();
    assert.equal(storageError(), true);
    assert.deepEqual(loadSearches(), []);
    assert.equal(setItem(SEARCHES_KEY, "[]"), false);
  });

  await check("outdated searches keep their card; only their results are removed", async () => {
    const now = Date.parse("2026-09-29T12:00:00Z");
    // Flights 30 days out: outdated after a day (RESULT_FRESHNESS_BY_DAYS_AHEAD).
    const query = {
      destinations: [{ cityId: "uk-london", airports: ["LHR"] }],
      origins: [],
      dateMode: "exact",
      departureDate: "2026-10-29",
    };
    const result = { arrangements: [{ id: "a", legs: [] }], records: [{ id: "r" }], priceGrid: { x: 1 } };
    const fresh = { id: "fresh", savedAt: "2026-09-29T09:00:00Z", label: "London · fresh", key: "k1", query, ...result };
    const old = {
      id: "old", savedAt: "2026-09-27T09:00:00Z", label: "London · old", key: "k2", query, kind: "google-curl",
      arrangements: [], googleCurl: { arrangements: [{ id: "g" }], records: [{ id: "r" }], requests: [{ label: "x", flights: 3 }] },
    };
    resetStorageClientForChecks({ [SEARCHES_KEY]: JSON.stringify([fresh, old]) });
    fakeWindow();
    const server = fakeServer();
    assert.equal(pruneOutdatedResults(now), 1);
    assert.equal(pruneOutdatedResults(now), 0, "an already cleaned search is left alone");
    const [a, b] = loadSearches();
    assert.equal(a.id, "fresh");
    assert.equal(a.arrangements.length, 1);
    assert.equal(b.id, "old");
    assert.equal(b.label, "London · old");
    assert.equal(b.resultsRemoved, true);
    assert.deepEqual(b.googleCurl?.arrangements, []);
    assert.equal(b.googleCurl?.records, undefined);
    assert.equal(b.googleCurl?.requests?.length, 1);
    assert.equal(await flushStorage(), true);
    assert.ok(server.values[SEARCHES_KEY]!.includes('"resultsRemoved":true'));
  });

  await check("how long prices stay current depends on how soon the flights are", () => {
    const now = Date.parse("2026-09-29T12:00:00Z");
    const hoursAgo = (h: number) => new Date(now - h * 3_600_000).toISOString();
    const leaving = (departureDate: string, savedAt: string) =>
      ({ id: "f", key: "f", label: "f", savedAt, arrangements: [],
         query: { dateMode: "exact", departureDate, destinations: [], origins: [] } }) as unknown as StoredSearch;

    // About a month out: a day.
    assert.equal(isStale(leaving("2026-10-29", hoursAgo(20)), now), false);
    assert.equal(isStale(leaving("2026-10-29", hoursAgo(25)), now), true);
    // 1–2 weeks out: 12 hours.
    assert.equal(isStale(leaving("2026-10-09", hoursAgo(11)), now), false);
    assert.equal(isStale(leaving("2026-10-09", hoursAgo(13)), now), true);
    // Months out: several days.
    assert.equal(isStale(leaving("2027-02-01", hoursAgo(72)), now), false);
    assert.equal(freshnessLimitMs(leaving("2027-02-01", hoursAgo(0)), now), 5 * 24 * 3_600_000);
    // Every flight gone: outdated.
    assert.equal(isStale(leaving("2026-09-20", hoursAgo(1)), now), true);

    // A range is judged by its first day still ahead, not one already passed.
    const range = {
      ...leaving("", hoursAgo(20)),
      query: {
        dateMode: "advanced", dateRange: { start: "2026-09-20", end: "2026-11-15" },
        tripType: "round-trip", tripDurationDays: 7, excludedDates: [], destinations: [], origins: [],
      },
    } as unknown as StoredSearch;
    assert.equal(freshnessLimitMs(range, now), 3_600_000, "today's flights (0 days ahead) set the limit");
    assert.equal(isStale(range, now), true);
    assert.equal(describeFreshness(12 * 3_600_000), "12 hours");
    assert.equal(describeFreshness(24 * 3_600_000), "1 day");
  });

  /* ── Gathered flights, kept apart ───────────────────────────────────────── */

  const flights = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `f${i}` }));
  const searchWith = (id: string, extra: Record<string, unknown> = {}) => ({
    id,
    savedAt: new Date().toISOString(),
    label: id,
    key: id,
    query: { destinations: [{ cityId: "uk-london", airports: ["LHR"] }], origins: [] },
    arrangements: [],
    ...extra,
  });

  await check("searches saved with their flights inside get them moved out, once", () => {
    const db = tempDb("separate");
    const curl = searchWith("s-curl", {
      kind: "google-curl",
      googleCurl: { arrangements: [], records: [{ id: "r1", flights: flights(3) }], requests: [] },
    });
    const plain = searchWith("s-plain");
    setValue(SEARCHES_KEY, JSON.stringify([curl, plain]), db);

    assert.equal(separateRecords(db), 1);
    const [movedCurl, movedPlain] = JSON.parse(getValues(db)[SEARCHES_KEY]!) as StoredSearch[];
    assert.equal(movedCurl.googleCurl?.records, undefined);
    assert.equal(movedCurl.gatheredFlights, 3);
    assert.deepEqual(movedCurl.googleCurl?.requests, [], "the rest of the search stays");
    assert.deepEqual(movedPlain, plain, "a search without flights is untouched");
    const stored = JSON.parse(getValue(recordsKeyOf("s-curl"), db)!);
    assert.equal(stored.googleCurl[0].flights.length, 3);
    assert.equal(getValue(recordsKeyOf("s-plain"), db), null);
    assert.equal(
      Object.keys(getValues(db)).some((key) => key.startsWith("airsearcher:records")),
      false,
      "the plain read never includes them",
    );
    assert.equal(separateRecords(db), 0, "never runs twice");
    db.close();
  });

  await check("a saved search keeps only the count; its flights load on demand", async () => {
    resetStorageClientForChecks({});
    fakeWindow();
    const server = fakeServer();
    saveSearch(
      searchWith("s-new", { records: [{ id: "r1", flights: flights(2) }, { id: "r2", flights: flights(1) }] }) as unknown as StoredSearch,
    );
    const [entry] = loadSearches();
    assert.equal(entry.records, undefined);
    assert.equal(gatheredFlightsOf(entry), 3);
    assert.equal(await flushStorage(), true);
    assert.ok(!server.values[SEARCHES_KEY]!.includes('"flights"'), "the list holds no flights");
    const loaded = await loadGatheredFlights(entry);
    assert.deepEqual(loaded.map((r) => r.flights.length), [2, 1]);

    removeSearch("s-new");
    assert.equal(await flushStorage(), true);
    assert.equal(server.values[recordsKeyOf("s-new")], null, "removing a search deletes its flights");
  });

  await check("an extended search keeps its id, card and age, with its flights merged in place", async () => {
    resetStorageClientForChecks({});
    fakeWindow();
    const server = fakeServer();
    const original = searchWith("s-ext", {
      kind: "google-curl",
      savedAt: "2026-09-30T08:00:00.000Z",
      query: {
        destinations: [], origins: [], gatheringAirport: "ATH", dateMode: "advanced", tripType: "round-trip",
        dateRange: { start: "2026-11-11", end: "2026-11-28" }, tripDurationDays: 7, excludedDates: [],
      },
      // Empty flight lists: the rebuild reads real flights, and this checks bookkeeping only.
      googleCurl: { arrangements: [], records: [{ id: "old", flights: [] }], requests: [{ label: "a", flights: 3 }] },
    }) as unknown as StoredSearch;
    saveSearch(original);
    const saved = loadSearches()[0];
    const extended = extendCurlSearch(
      saved,
      { ...saved.query, dateRange: { start: "2026-11-11", end: "2026-12-02" } },
      DEFAULT_FILTERS,
      DEFAULT_RANKING_CONFIG,
      [{ id: "old", flights: [] }, { id: "new", flights: [] }] as unknown as FlightRecord[],
      ["note"],
      [{ label: "b", flights: 2 }],
    );
    const [entry, ...rest] = loadSearches();
    assert.equal(rest.length, 0, "still one card");
    assert.equal(entry.id, "s-ext");
    assert.equal(entry.savedAt, "2026-09-30T08:00:00.000Z", "judged by its oldest flights");
    assert.ok(entry.extendedAt);
    assert.equal(entry.query.dateRange?.end, "2026-12-02");
    assert.deepEqual(entry.googleCurl?.requests?.map((r) => r.label), ["a", "b"]);
    assert.equal(extended.id, "s-ext");
    assert.equal(await flushStorage(), true);
    const stored = JSON.parse(server.values[recordsKeyOf("s-ext")]!);
    assert.deepEqual(stored.googleCurl.map((r: { id: string }) => r.id), ["old", "new"]);
  });

  await check("a CurlError from before a hot reload is still recognised by its code", () => {
    const stale = Object.assign(new Error("limit"), { name: "CurlError", code: "cooling_down" });
    assert.equal(asCurlError(stale)?.code, "cooling_down");
    assert.equal(asCurlError(new CurlError("timeout", "t"))?.code, "timeout");
    assert.equal(asCurlError(new Error("other")), null);
  });

  resetStorageClientForChecks(null);
  delete (globalThis as { window?: unknown }).window;
  fs.rmSync(dir, { recursive: true, force: true });
  console.log(`\n${passed} checks passed.`);
}

void main().catch((error) => {
  fs.rmSync(dir, { recursive: true, force: true });
  console.error(error);
  process.exit(1);
});
