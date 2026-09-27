# Phase 08 — Google Flights cURL Requests (branch `request`)

**Goal:** paste one or more "Copy as cURL" requests from Google Flights into a
list of text areas on the home page. The local backend runs each one with the
real `curl` binary, spaced out so it never looks like a bot. The flights are
extracted from every response and fed into the existing
pool → arrangements → ranking pipeline, and they appear on `/results` as a
third source tab, **Google (cURL)**, next to SerpApi and Travelpayouts.

**Scope:** local, single-user use only. It is **not** a scraper: every request
is one the user made in their own browser, re-sent once, at human pace.

**Branch:** everything lives on local `request`. Nothing is committed or
pushed.

---

## 0 — Decisions (confirmed with the user)

| Question | Decision |
| --- | --- |
| Where the text areas go | Home page, a new panel **below `SearchPanel`**, above the search history |
| Relation to other sources | **Third source tab** on `/results`. SerpApi and Travelpayouts keep working unchanged |
| Kind of cURL | **One-way** Google Flights searches: one cURL per route + date + direction |
| Backend | New route `app/api/airsearcher/curl/route.ts` (approved). No existing `app/api/` file is touched |
| Persistence of the text areas | **None.** React state only. Not in localStorage. Gone on reload |

Further decisions made in this plan (easy to change):

- The panel has its **own "Run cURLs" button**. It spends **zero** SerpApi
  requests, and the main **Search** button behaves exactly as today.
- The route data (origins, passengers, gathering airport, destinations, dates)
  comes from the **current `SearchPanel` query**, just like a normal search.
  The cURLs only supply the flights.

---

## 1 — ⚠ Before anything: the sample cURL has no body

The pasted sample is a `POST` with `Content-Length: 653`, but it has **no
`--data-raw 'f.req=…'` part**. The body is what tells Google *which* route and
date to search. Without it Google returns an error, not flights.

Firefox's **Copy Value → Copy as cURL** normally includes `--data-raw`. Either
it was cut off while pasting, or it was copied another way. The parser must
reject this case with a clear message:

> "This cURL is a POST without a body (`--data-raw`). Copy it again with
> **Copy as cURL** on the `GetShoppingResults` request."

**Needed from the user before the first live test:** one complete cURL,
including `--data-raw`.

---

## 2 — ⚠ Secrets in the cURL

A copied cURL carries the full Google login session (`SID`, `__Secure-1PSID`,
`SAPISID`, `SIDCC`, …) in its `Cookie` header. Anyone who has it is logged in
as the user. Rules for the whole feature:

1. The cURL text lives **only** in React state and in the body of the one
   request to our local route. It is never written to localStorage, a
   `StoredSearch`, a log line, an error message or a fixture file.
2. The route **never echoes** the command or its headers back. Errors describe
   the problem, not the input.
3. Captured response fixtures hold the **response body only**, never request
   headers. They go in the already-gitignored `scripts/airsearcher/.cache/`.
4. Advise the user: after testing, sign out of the Google session used for
   copying, or rotate it, since the sample above has been pasted into a chat.

---

## 3 — Architecture

```
Home page
  CurlRequestsPanel ── list of <textarea> (add / remove), "Run cURLs", Stop
        │  one cURL per call, sequentially
        ▼
POST /api/airsearcher/curl        (localhost only)
  1. parseCurl(text)              → { url, method, headers, body }   (lib)
  2. validateCurl(parsed)         → allowlist check                  (lib)
  3. rateLimiter.wait()           → ≥ CURL_MIN_INTERVAL_MS since last run
  4. runCurl(parsed)              → execFile("curl"/"curl.exe", args) — no shell
  5. classify(exit code, HTTP status, body) → ok | typed error
  6. parseShoppingResults(body)   → NormalizedFlight[]               (lib)
  ◄─ { flights, route: {from, to, date}, status } | { error: {code, message} }
        │
        ▼
Client: flightsToRecords(query, results) → FlightRecord[]
        → poolFromRecords → buildSearchResult → StoredSearch.googleCurl
        → router.push(/results?search=…)   (tab "Google (cURL)")
```

The server does **one cURL per call** and the client loops over them. That
makes a Stop button trivial, gives live per-row progress, and keeps each HTTP
call short. The **server** still enforces the interval, so two tabs or a
double click can never burst.

---

## 4 — Config: `app/lib/airsearcher/config/curl.ts` (new)

A behaviour config, so it goes next to `constants.ts` (same reasoning as its
header: `app/config/` is the user's style/UI folder).

```ts
/** Minimum gap between two Google requests. Never go below this. */
export const CURL_MIN_INTERVAL_MS = 10_000;

/** Random extra wait added on top (0..this), so the gaps aren't metronomic. */
export const CURL_JITTER_MS = 3_000;

/** One request may take this long before curl gives up. */
export const CURL_TIMEOUT_MS = 30_000;

/** Most cURLs one run accepts. A guard against pasting a whole HAR. */
export const CURL_MAX_PER_RUN = 20;

/** Largest response body accepted from curl. */
export const CURL_MAX_RESPONSE_BYTES = 10 * 1024 * 1024;

/** The only URL prefix the route will ever send a request to. */
export const CURL_ALLOWED_URL_PREFIX =
  "https://www.google.com/_/FlightsFrontendUi/data/travel.frontend.flights.FlightsFrontendService/";
```

The jitter is **added** to the minimum, so the gap is always ≥ 10 s.
Setting `CURL_JITTER_MS = 0` gives exactly 10 s.

---

## 5 — Library code (`app/lib/airsearcher/curl/`, new folder)

Small files, one job each, all pure (no I/O) except `run.ts` and
`rateLimit.ts`, which are server-only.

### 5.1 `tokenize.ts` — cross-OS command splitting

Browsers copy cURL in different dialects. Normalize, then tokenize:

| Dialect | Where it comes from | Handling |
| --- | --- | --- |
| POSIX (`'…'`, `\` line continuation) | Firefox/Chrome "Copy as cURL (POSIX)", Linux/macOS default | Strip `\⏎`. Single quotes are literal. Double quotes honour `\"`, `\\`. Support `$'…'` (Chrome uses it for bodies with escapes) |
| Windows cmd (`"…"`, `^` escapes, `^⏎` continuation) | "Copy as cURL (Windows)" / "(cmd)" | Strip `^⏎`, un-escape `^X` → `X`, `""` inside quotes → `"` |
| PowerShell (`Invoke-WebRequest`, backtick continuation) | "Copy as PowerShell" | **Reject**: "PowerShell format isn't supported — use *Copy as cURL*." |

Auto-detect by content: `^"` or a line ending in `^` means cmd;
`Invoke-WebRequest` means PowerShell; otherwise POSIX. A leading `curl` or
`curl.exe` is required.

### 5.2 `parse.ts` — tokens → `ParsedCurl`

```ts
interface ParsedCurl {
  url: string;
  method: "GET" | "POST";
  headers: [name: string, value: string][];
  body: string | null;
}
```

Recognised flags: `-X/--request`, `-H/--header`, `-d/--data/--data-raw/
--data-binary/--data-ascii`, `-b/--cookie` (inline value only), `--compressed`,
`--url`, and the bare URL. **Any other flag is an error that names it**
(`-o`, `-K/--config`, `-T`, `-F`, `--proxy`, `-u`, `-x`, …). A data value
starting with `@` (read from a file) is rejected.

### 5.3 `validate.ts` — allowlist

- The URL must start with `CURL_ALLOWED_URL_PREFIX` and use `https:`.
  The endpoint must be `GetShoppingResults` (clear error for other RPCs such as
  `GetCalendarGraph`, which may be supported later).
- `POST` needs a body containing `f.req=` (see §1).
- Drop headers that curl must compute itself or that would break decoding:
  `Content-Length`, `Accept-Encoding` (replaced by `--compressed`, which asks
  only for the encodings *this* curl build supports — `br`/`zstd` aren't
  compiled in everywhere), `Connection`, `TE`, `Alt-Used`, `Host`.
- Must be one-way: decode `f.req` and check the trip-type field. A round trip
  gets the error: "This is a round-trip search. Copy one-way searches, one per
  direction."
- Extract `{ from, to, date }` from `f.req`. Otherwise it's derived from the
  parsed flights (§6).

### 5.4 `args.ts` — rebuild an argv array (never pass user text through)

```
curl -sS --compressed --max-time <s> --max-filesize <bytes>
     -X POST -H "<name>: <value>" … --data-raw "<body>"
     -w "\n__AIRSEARCH_META__%{http_code} %{content_type} %{url_effective}"
     <url>
```

Arguments are rebuilt from `ParsedCurl`, so nothing unvalidated reaches curl.

### 5.5 `run.ts` — execute, cross-OS (server-only)

- `execFile(bin, args, { shell: false, windowsHide: true, maxBuffer, timeout })`
  with `bin = process.platform === "win32" ? "curl.exe" : "curl"`.
  `curl.exe` sidesteps PowerShell's old `curl` → `Invoke-WebRequest` alias.
  No shell means no quoting differences between bash, zsh, cmd and PowerShell,
  and no injection.
- On first use, run `curl --version` once and cache the result:
  - `ENOENT` → error `curl_missing`: "curl isn't installed or isn't on PATH"
    plus an OS hint (Windows 10+ ships it at `C:\Windows\System32\curl.exe`;
    macOS has it built in; Linux: install `curl` with the package manager).
  - Log (server console only) whether brotli/zstd are supported.
- If the incoming HTTP request is aborted (Stop button), kill the child process.

### 5.6 `rateLimit.ts` — the 10-second gate (server-only)

A module-level promise chain: each run waits for the previous one to finish,
then until `lastFinishedAt + CURL_MIN_INTERVAL_MS + random(0..CURL_JITTER_MS)`.
The gap is measured from when the previous request **finished**, so a slow
response never shortens it. The route replies with `waitedMs`, so the UI can
show the countdown honestly.

It's in-memory, per server process. That's fine for local single-user use.
A `next dev` hot reload resets it: document this, and the client-side gap
(§7) still covers it.

### 5.7 `classify.ts` — error taxonomy

Every failure becomes `{ code, message, retryable, stopRun }`:

| Code | Trigger | Stops the whole run? |
| --- | --- | --- |
| `parse_error` / `flag_not_allowed` / `url_not_allowed` / `missing_body` / `round_trip` / `powershell` | §5.1–5.3 | No, only that row |
| `curl_missing` | ENOENT | **Yes** |
| `network` | curl exit 6/7 (DNS/connect), 35/60 (TLS) | Yes |
| `timeout` | exit 28 or `execFile` timeout | No (row can be retried manually) |
| `too_large` | exit 63 / maxBuffer | No |
| `session_expired` | HTTP 401/403, or a redirect to accounts.google.com | **Yes**: "Copy fresh cURLs" |
| `rate_limited` | HTTP 429, a redirect to `/sorry/`, or a captcha/"unusual traffic" HTML | **Yes**, and the route refuses new runs for 10 min |
| `http_error` | Any other non-2xx | No |
| `unrecognised_response` | 2xx but no `)]}'` prefix / no `wrb.fr` payload | No |
| `no_flights` | Parsed fine, zero flights | No (it's a warning, not an error) |

Nothing is retried automatically. A retry is another request, and retries
are exactly what looks like a bot.

---

## 6 — Response parsing: `app/lib/airsearcher/curl/shopping.ts`

`GetShoppingResults` with `rt=c` returns Google's chunked RPC format:

```
)]}'
<length>
[["wrb.fr",null,"<escaped JSON string>", …], …]
<length>
[…]
```

Steps: strip `)]}'`, walk `<length>\n<json>` chunks, keep `wrb.fr` entries,
`JSON.parse` their inner string, and read the flight lists from it.

The inner payload is undocumented positional arrays. From public
reverse-engineering (e.g. the `fast-flights` project), the best and other
flights are expected near `payload[2][0]` and `payload[3][0]`. Each item
holds airline code/names, segments, departure/arrival airport, date
`[y, m, d]`, time `[h, m]`, duration, and a price at roughly `item[1][0][1]`.
**Treat every index as unverified until checked against a real captured
response (Task B2).** The parser must:

- Access by guarded helpers (like `objectOf`/`numberOf` in `serpApi.ts`),
  never trust a shape, and skip an item rather than throw.
- Output the existing `NormalizedFlight` shape (`category: "best" | "other"`,
  `currency` from the `x-goog-ext-259736195-jspb` header, `EUR` in the sample),
  so nothing downstream changes.
- Return `unrecognised_response` if no flight list is found at all. This
  catches a silent Google format change instead of reporting "0 flights".

**Mapping to `FlightRecord`** (`curl/records.ts`, client-safe):

- `from`/`to`/`date` come from `f.req` (§5.3), falling back to the first
  departure and last arrival of the parsed flights.
- `direction` and `reason` come from the current query. If `to` is a
  destination airport, the record is `outbound`: `main` when `from` is the
  gathering airport, else `direct`. If `from` is a destination, it's `return`.
  Origin ↔ gathering airport is a `feeder` (either direction, by which end is
  the gathering airport).
- Records that fit no planned route are **not dropped silently**. They appear
  in the panel as "ignored: ATH→LHR 9 Oct isn't part of this search".
- Several cURLs for the same route+date are merged with `uniqueFlights`.

---

## 7 — UI: `app/components/airsearcher/home/curl/` (new)

| File | Contents |
| --- | --- |
| `CurlRequestsPanel.tsx` | The panel: header, row list, "Add cURL", "Run cURLs", "Stop", coverage list |
| `CurlRow.tsx` | One text area, a remove button, a status line (idle / waiting 8 s / running / ✓ 34 flights ATH→LON 8 Oct / ✗ error) |
| `CurlCoverage.tsx` | "Routes this search needs": `planSearches(query)` with ✓ against the pasted cURLs. It tells the user exactly which searches to copy |
| `useCurlRun.ts` | The sequential loop: validates all rows first, then one POST per row, `AbortController` for Stop, stops the run on a `stopRun` error, and a client-side countdown |

Details:

- Starts with **one empty row**. "Add" appends, "Remove" deletes (the last row
  empties instead of disappearing). State is `useState` only.
- Before any request, every row is parsed on the client (the same pure
  `tokenize`/`parse`/`validate`). Invalid rows are flagged, and **no request is
  sent until all rows are valid or removed**. A typo therefore never costs a
  live request.
- Identical cURLs (same URL + body) are de-duplicated before running, with a
  note.
- While a run is in progress, the text areas are read-only and the main
  Search button is disabled.
- When it finishes: build the `googleCurl` result (§8), save it, and go to
  `/results?search=<id>&source=google-curl`. If *every* row failed, stay on the
  page with the errors.
- **Styling:** `Button` for every button, `Text` for labels/status, and colours,
  radii and spacing from `@/config/theme`. The framework has **no textarea
  component** (`Input` is `<input>` only), so the row uses a raw `<textarea>`
  styled from theme tokens. **Open question for the user:** is that OK, or
  would you rather add a `textarea` variant to `inputTypeConfig`/`Input`
  (config and framework edits need your go-ahead)?
- Responsive: rows full-width, buttons wrap on mobile.

---

## 8 — Results integration

- `StoredSearch` (`storage.ts`) gets an optional field shaped like
  `travelpayouts`:

  ```ts
  googleCurl?: {
    arrangements: Arrangement[];
    priceGrid?: StoredPriceGrid;
    records?: FlightRecord[];
    warnings?: string[];   // ignored routes, rows with no flights
  };
  ```

  It holds flight data only, never cURL text (§2).
- A new `runCurlSearch(query, filters, preferences, records)` in
  `search.ts` builds it with the existing `buildSearchResult`, so the same
  ranking, filters, gathering logic and price grid apply. It **doesn't** use the
  `findFreshByKey` reuse: a cURL run is always an explicit, fresh result.
- `/results`: `ResultSource` gains `"google-curl"` with the label
  "Google (cURL)". The `bothSources` logic becomes "tabs for every source the
  entry has". `?source=` selects the tab on arrival. The price grid and every
  filter work unchanged because they read arrangements.
- The history card shows a small "cURL" badge for these entries.

---

## 9 — The route: `app/api/airsearcher/curl/route.ts` (new, approved)

- `runtime = "nodejs"` (needs `child_process`).
- **Localhost only:** `404` when `process.env.NODE_ENV === "production"`,
  unless `AIRSEARCH_ENABLE_CURL=1` is set, and `403` when the request's `Host`
  isn't `localhost`/`127.0.0.1`/`[::1]`.
- Body: `{ curl: string }`. One cURL, at most 64 KB.
- Refuses while a `rate_limited` cool-down is active (§5.7).
- Response: `{ ok: true, route, flights, currency, httpStatus, waitedMs }` or
  `{ ok: false, error: { code, message, stopRun } }`, always JSON and never
  echoing the input.

---

## 10 — Testing within a strict request budget

**Hard cap: at most 2 live Google requests during the whole implementation.**
Everything else runs offline.

1. **Offline first:** tokenizer/parser/validator checks in
   `app/lib/airsearcher/__checks__/run.ts` style. Cover POSIX, cmd and
   PowerShell samples, the sample cURL (expects `missing_body`), rejected
   flags, `@file` data, a non-Google URL and a round-trip body.
2. **Rate limiter** tested with a fake executor and fake clock, never against
   Google.
3. **Live request #1 (with the user's go-ahead, using a complete one-way
   cURL):** run once through the route and save the **response body only** to
   `scripts/airsearcher/.cache/shopping-sample.txt` (gitignored). All parser
   work (§6) is done against this fixture.
4. **Live request #2 (optional):** two rows in the UI, to see the ≥ 10 s gap
   and the end-to-end flow to `/results`. Never two runs back to back.
5. `npm run build` / lint, plus a manual UI check at mobile and desktop widths
   with the fixture served by a temporary dev-only mock executor, which is
   removed afterwards.

---

## 11 — Task list

| # | Task | Files |
| --- | --- | --- |
| A1 | Config constants | `lib/airsearcher/config/curl.ts` |
| A2 | Tokenizer (POSIX/cmd/PowerShell detect) | `lib/airsearcher/curl/tokenize.ts` |
| A3 | Parser + flag allowlist | `lib/airsearcher/curl/parse.ts` |
| A4 | Validator, `f.req` decode (route, date, one-way) | `lib/airsearcher/curl/validate.ts`, `curl/freq.ts` |
| A5 | Offline checks for A2–A4 | `lib/airsearcher/__checks__/` |
| B1 | argv builder, runner, rate limiter, classifier | `curl/args.ts`, `run.ts`, `rateLimit.ts`, `classify.ts` |
| B2 | API route + **live request #1** → fixture | `app/api/airsearcher/curl/route.ts` |
| B3 | Response parser against the fixture | `curl/shopping.ts` |
| B4 | Flights → `FlightRecord` mapping + warnings | `curl/records.ts` |
| C1 | `googleCurl` on `StoredSearch`, `runCurlSearch` | `storage.ts`, `search.ts` |
| C2 | Panel, rows, coverage, run hook | `components/airsearcher/home/curl/*` |
| C3 | Mount the panel on the home page | `app/page.tsx` |
| C4 | Third tab on `/results`, `?source=`, history badge | `app/results/page.tsx`, `SearchHistoryCard.tsx` |
| D1 | **Live request #2** (optional), build, lint, responsive check | — |

Files **not** touched: anything under `app/config/`, `app/framework/`, the
existing `app/api/` routes, and `prisma/`.

---

## 12 — Open items for the user

1. Paste one **complete one-way** cURL (with `--data-raw`) when we reach B2.
2. `<textarea>` styled from theme tokens, or add a textarea variant to the
   config/`Input` (§7)?
3. Jitter default of 0–3 s on top of the 10 s minimum. OK, or exactly 10 s?
