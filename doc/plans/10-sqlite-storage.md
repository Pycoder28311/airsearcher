# Phase 10 — Local SQLite Instead of localStorage (branch `request`)

**Goal:** everything the app saves today in the browser's localStorage
(searches, filters, preferences) is saved instead in a local SQLite file on
this machine, through a small localhost-only endpoint. Every page, button,
limit and message keeps working exactly as now; only where the data lives
changes.

**Depends on:** nothing (works with 08/09 as they are).
**Blocks:** nothing.

---

## 0 — Decisions

Confirmed with the user:

| Question | Decision |
| --- | --- |
| Where the app runs | **Only locally** (`npm run dev` / `npm start` on this machine). The database is a file in the project folder |
| SQLite library | **better-sqlite3**: mature, synchronous, supported by Next.js on the server |
| How the browser reaches it | **New route `app/api/airsearcher/storage/route.ts`**, localhost-only, same pattern as the cURL route. Permission for this `app/api` file is given by this plan's approval |
| Data already in localStorage | **Imported once** into SQLite on the first start with an empty database; localStorage is then left untouched as a backup and no longer read |

Defaults chosen in this plan (easy to change):

| Default | Why |
| --- | --- |
| **One key–value table that mirrors localStorage 1:1**: the same three keys (`airsearcher:searches:v1`, `airsearcher:filters:v1`, `airsearcher:prefs:v1`) and the same JSON values | This is what makes "functionality exactly as now" safe: `loadSearches`, `upgradeEntry`, the legacy-leg upgrade, `saveSearch`'s shedding and every validator keep running on the same data unchanged. Normalized tables (one row per search) are a possible later phase, not part of this one |
| **`storage.ts` keeps its synchronous API** (`loadSearches()`, `saveSearch()`, …) | ~20 call sites in `app/page.tsx`, `app/results/page.tsx`, `search.ts` and `curlRunner.ts` stay as they are. Reads come from an in-memory copy loaded once per page; writes update that copy at once and are sent to SQLite in the background |
| **A 5 MB budget per value**, checked before a write is accepted | localStorage refuses writes above ~5 MB, and `saveSearch` relies on that to shed raw flight records from older searches. Keeping the same limit keeps that behaviour, and keeps each page load small, since the whole searches value is loaded once per page |
| Database file **`data/airsearch.sqlite`**, overridable with `AIRSEARCH_DB_PATH`; `/data/` added to `.gitignore` | Never committed: it holds search history |
| Route works in **dev and `npm start`**, **only on localhost** | "Only locally" includes the production build run on this machine. Unlike the cURL route there is no production 404, or the app would lose its storage under `npm start` |
| SQLite settings: **WAL**, `busy_timeout = 5000`, `synchronous = NORMAL`; one connection kept on `globalThis` | WAL + busy timeout let the dev server and the check scripts use the file at the same time; the global keeps one connection across hot reloads |

---

## 1 — Risks and blockers

1. **A write in flight when the tab closes.** Writes are asynchronous now. While
   one is pending, a `beforeunload` guard asks the browser to confirm leaving,
   and the app awaits `flushStorage()` before it navigates to the results page.
   A lost write needs the tab to close within milliseconds of a save, *and*
   the user to ignore the warning.
2. **Server not running or unreachable.** Same outcome as today's "storage
   blocked": the pages get defaults and empty history, plus one warning alert.
   Writes stay queued and are retried (1 s, 2 s, 4 s … up to 30 s).
3. **Native package.** better-sqlite3 ships prebuilt binaries for Linux x64 and
   Node 24. If none matches, `npm install` compiles it, which needs build tools
   (`gcc`, `make`, `python3`). Task 1 checks this first.
4. **Several tabs.** As with localStorage today, each page reads the saved data
   when it loads. A tab left open doesn't see another tab's later changes until
   it reloads. Its writes still land correctly (last write per key wins), which
   matches localStorage.

---

## 2 — Architecture

```
Browser                                        Server (Node, localhost only)
─────────────────────────────────────          ──────────────────────────────────
page.tsx / results/page.tsx
  await storageReady()   ──GET  /api/airsearcher/storage──▶  route.ts
                                                              └─ sqlite.ts  getValues()
storage.ts (unchanged public API)                                     │
  loadSearches() ─▶ readJson() ─▶ storageClient cache                 ▼
  saveSearch()   ─▶ writeJson() ─▶ cache + queue                data/airsearch.sqlite
                      queue ──PUT  /api/airsearcher/storage──▶  sqlite.ts  setValue()
first run only:  localStorage ─POST …/storage/import─▶   sqlite.ts  importOnce()
```

Only the three private helpers at the top of `storage.ts` (`getStorage`,
`readJson`, `writeJson`) change. They read and write through
`storageClient.ts` instead of `window.localStorage`, and everything else in
the file stays byte-for-byte the same.

---

## 3 — Server: `app/lib/airsearcher/db/sqlite.ts` (new, server-only)

- `import "server-only"` (or a runtime check) so the browser bundle can never
  pull it in.
- `openDb()`: opens `AIRSEARCH_DB_PATH ?? path.join(process.cwd(), "data", "airsearch.sqlite")`
  and creates the folder if missing. Sets the pragmas from §0 and creates the
  schema when `PRAGMA user_version` is 0, then sets it to 1. Kept on
  `globalThis.__airsearcherDb`.
- Schema:
  ```sql
  CREATE TABLE IF NOT EXISTS kv (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL,          -- the exact JSON string localStorage held
    updated_at TEXT NOT NULL           -- ISO timestamp, for inspection only
  );
  CREATE TABLE IF NOT EXISTS meta (
    name  TEXT PRIMARY KEY,
    value TEXT NOT NULL                -- 'imported' → ISO timestamp
  );
  ```
- Functions (all synchronous, prepared statements):
  - `getValues(keys: StorageKey[]): Record<StorageKey, string | null>`
  - `setValue(key, value: string | null)`: upsert, or delete when `null`
  - `importState(): { imported: boolean }`
  - `importOnce(values)`: in **one transaction**, only if `meta.imported` is
    unset *and* `kv` is empty, write the given values and set `meta.imported`.
    Returns whether it imported.

## 4 — Shared: `app/lib/airsearcher/db/keys.ts` (new)

- `STORAGE_KEYS = ["airsearcher:searches:v1", "airsearcher:filters:v1", "airsearcher:prefs:v1"] as const`,
  `type StorageKey`, `isStorageKey()`. `storage.ts` imports its three
  constants from here instead of defining them.
- `STORAGE_ROUTE = "/api/airsearcher/storage"`.

Limits go in a new `app/lib/airsearcher/config/storage.ts`, next to the
existing `config/curl.ts` (not `app/config`, which is the user's):
`STORAGE_MAX_VALUE_BYTES = 5 * 1024 * 1024`, retry delays, and the flush
timeout.

## 5 — API: `app/api/airsearcher/storage/route.ts` (new; approved in §0)

Copies the cURL route's safety pattern: `runtime = "nodejs"`,
`dynamic = "force-dynamic"`, the same `hostnameOf` / `LOCAL_HOSTS` check
(403 otherwise), and `Cache-Control: no-store`.

| Method | Body | Does |
| --- | --- | --- |
| `GET` | — | `{ values: { [key]: string \| null }, imported: boolean }` |
| `PUT` | `{ key, value: string \| null }` | Key must be in `STORAGE_KEYS`, and `value` a JSON string no longer than `STORAGE_MAX_VALUE_BYTES` (checked again on the server). Answers `{ ok: true }`, or `413` / `400` |
| `POST` `/import` (or `?import=1`) | `{ values: { [key]: string } }` | `importOnce`. Answers `{ imported: boolean }` |

Errors never echo the stored data. An unexpected SQLite error is logged by
name only and answered with `500`.

## 6 — Browser: `app/lib/airsearcher/storageClient.ts` (new)

- **Cache:** a `Map<StorageKey, string | null>`, filled once by
  `storageReady()`: one shared promise, a GET, then the first-run import.
- **First-run import:** if the GET says `imported: false` and every value is
  `null`, it reads the three keys from `window.localStorage`, POSTs whatever
  exists, and uses those values as the cache. localStorage is never written or
  cleared.
- `getItem(key)`: sync, from the cache. Returns `null` before `storageReady`
  finished, exactly as localStorage returns nothing during the server render
  today.
- `setItem(key, value): boolean`: sync. Returns `false` (write refused) when the
  value is over `STORAGE_MAX_VALUE_BYTES`, as localStorage does over its quota,
  so `saveSearch`'s shedding still runs. Otherwise it updates the cache,
  queues the write, and returns `true`.
- **Queue:** one request in flight at a time. Pending writes to the same key
  collapse to the latest. Retries with the §1 backoff.
  `flushStorage(): Promise<boolean>` resolves when the queue is empty, or
  `false` after the timeout.
- **Guard:** a `beforeunload` listener active only while the queue isn't empty.
- **Unreachable server:** `storageReady()` resolves anyway, with an empty cache
  and `storageError()` set, so the pages can show one warning.

## 7 — Changes to existing files

| File | Change |
| --- | --- |
| `app/lib/airsearcher/storage.ts` | `getStorage`/`readJson`/`writeJson` use `storageClient`; header comment updated ("the only module that touches saved data"). Nothing else changes |
| `app/page.tsx` | The mount effect waits for `storageReady()` before `loadSearches()` and `loadPreferences()`, and shows one alert if `storageError()`. Await `flushStorage()` before `router.push` to `/results` (search, cURL result, history card) |
| `app/results/page.tsx` | The mount effect waits for `storageReady()` before `findSearchById` / `loadFilters` / `loadPreferences`. Its "Loading…" state covers the wait, and "No results to show" appears only after it |
| `app/lib/airsearcher/__checks__/run.ts` | The two storage checks set up the `storageClient` cache instead of a fake `window.localStorage`. The same assertions: defaults without data, legacy entry upgraded |
| `package.json` / lockfile | `better-sqlite3`, and `@types/better-sqlite3` (dev) |
| `.gitignore` | `/data/` |
| `next.config.ts` | Nothing, if better-sqlite3 is on Next's built-in server-external list (checked in Task 1). Otherwise add `serverExternalPackages: ["better-sqlite3"]` |

`search.ts`, `curlRunner.ts` and all components are **not** changed. They
only call `storage.ts`, whose API stays the same.

---

## Testing

- **New `app/lib/airsearcher/__checks__/storage.ts`** (offline, `npx tsx`), using a temporary database file:
  - schema created once, and `user_version` = 1;
  - set/get/delete round trip; WAL mode on;
  - `importOnce` imports only into an empty, never-imported database;
  - a second `importOnce` does nothing;
  - the key allowlist refuses other keys;
  - an oversized value is refused.
- **Client checks** (same file, `fetch` stubbed):
  - `setItem` over the budget returns `false`;
  - writes to the same key collapse;
  - a failed PUT is retried;
  - `flushStorage` resolves after the queue drains;
  - before `storageReady`, reads return `null`.
- **Existing suites** still pass: `__checks__/run.ts` (58) and `__checks__/curl.ts` (40). Then `npx tsc --noEmit` and eslint.
- **Manual, in the app** (no Google or SerpApi requests needed):
  1. First start: the existing history appears (imported), and `data/airsearch.sqlite` exists.
  2. Change a filter, reload: it's kept.
  3. Delete a history card, restart `npm run dev`: it's still gone.
  4. Open a saved result by URL in a new tab: it loads.
  5. Stop the server while the page is open: one warning, and nothing breaks.
  6. Delete the database file and restart: the app creates a new one. Whether it re-imports the localStorage backup depends on the first Open item.

---

## Task list

| # | Task | Files |
| --- | --- | --- |
| 1 | Install `better-sqlite3` + types; confirm a prebuilt binary loaded (no compile) and that Next bundles it on the server | `package.json`, lockfile, maybe `next.config.ts` |
| 2 | Keys, route path and limits | `db/keys.ts`, `config/storage.ts` |
| 3 | SQLite module: open, pragmas, schema, get/set/import | `db/sqlite.ts` |
| 4 | Offline checks for task 3 | `__checks__/storage.ts` |
| 5 | Storage route (localhost-only, allowlist, size limit, import) | `app/api/airsearcher/storage/route.ts` |
| 6 | Browser client: cache, `storageReady`, queue, retry, flush, guard, import | `storageClient.ts` |
| 7 | Client checks | `__checks__/storage.ts` |
| 8 | Point `storage.ts`'s three helpers at the client | `storage.ts` |
| 9 | Wait for `storageReady` in both pages; flush before going to `/results`; one warning on error | `app/page.tsx`, `app/results/page.tsx` |
| 10 | Adapt the two storage checks | `__checks__/run.ts` |
| 11 | `.gitignore` `/data/`; run all checks, `tsc`, eslint; the manual list above | `.gitignore` |

Files **not** touched: `app/config/**`, `app/framework/**`, `prisma/schema.prisma`
(the app's Prisma/Postgres setup stays as it is), every other `app/api/**`
route, and every component under `app/components/**`.

---

## Open items

- **Deleting the database file later:** the import flag lives in the database,
  so a brand-new database **re-imports the old localStorage backup** (the data
  from before the switch, not anything saved since). Is that fine? The
  alternative is "import once ever": a marker is also written to localStorage,
  which would be the only write this plan makes there.
- **5 MB budget:** keep it, as now, or raise it so older searches keep their
  raw flight data? Raising it makes each page load bigger, because the
  searches value is loaded whole.
