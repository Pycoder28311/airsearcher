# Phase 09 — One Session cURL, Searches Built From the Inputs (branch `request`)

**Goal:** paste **one** Google Flights cURL as a *session*. The app keeps what
Google needs from it to accept a request (the session cookies and tokens), and
builds every search the trip needs from the top inputs: airports, dates,
direction and date range. Those searches run through the same paced runner and
the same ranking as Phase 08, and the results land in the "Google (cURL)" tab.

**Depends on:** 08 (cURL runner, parser, records, results tab).
**Blocks:** nothing.

---

## 0 — Decisions

Confirmed with the user:

| Question | Decision |
| --- | --- |
| Relation to Phase 08 | **Both.** A new "session cURL" box comes first; the per-search text areas stay below it as a fallback |
| Routes per request | **Group airports**, like SerpApi: reuse `planRequestBatches` (≤ `MAX_AIRPORTS_PER_REQUEST` = 7 per side). Exact round trip ATH+SKG+HER → London ≈ **2 requests** |
| Passengers sent to Google | **Always 1 adult.** Per-person one-way fares; the app multiplies by each group's size, as now |
| Most requests per run | **20** (`CURL_MAX_PER_RUN`, already 20). The count is always shown, and anything above 1 needs confirmation |

Defaults chosen in this plan (easy to change):

| Default | Why |
| --- | --- |
| Every generated search is **one-way** (trip type 2) | Round-trip answers carry round-trip prices (seen live in Phase 08) |
| The **server** rewrites the search, not the browser | The server already re-validates everything; it must never send a body it didn't build itself |
| Rolling cap of **60 generated requests per hour** on the server (`CURL_MAX_PER_HOUR`) | The only published figure (uncited) puts long-term safe rates at 3–100+/hour. 60 stays inside it with room for the 10 s gap |
| The session cURL is **never stored** | It holds the Google login, same rule as Phase 08 |
| Airports are sent as IATA codes, not Google city ids | The app only knows IATA codes; to be confirmed by Task 0 |

---

## 1 — Risks and blockers

### 1.1 Blocker: will Google accept a changed search? (Task 0 decides)

Nobody documents whether a request with a rewritten `f.req` is accepted. Three
parts of the copied request could be tied to the original search:

| Part | What it is | Worry |
| --- | --- | --- |
| `X-Goog-BatchExecute-Bgr` header | Google's browser-check token | May be signed over the request body |
| The search token in `f.req` (`search[0][3]`, a `"H…"` string) | Google's search-session id | May have to match the route/date |
| `Referer` header (`tfs=…`) | The page the search was made on | Describes the original route |

**Task 0 is a go/no-go test with at most 3 live requests.** If Google rejects
changed searches, this phase stops. Phase 08 (paste every search) stays the
way to use the app, plus an improvement: rows whose route or date doesn't fit
the trip get flagged before sending (see Open items).

### 1.2 This is a bigger step than Phase 08

Phase 08 only re-sends requests the user made in the browser. This phase
**creates** searches the user never ran. That is closer to the automated access
Google's terms forbid, so the guards matter more:

- a confirmation that shows the exact count and time;
- the 20-per-run cap and the server-side hourly cap;
- the ≥ 10 s gap plus jitter;
- stop the run and pause 10 min on a captcha or 429 (already in Phase 08).

### 1.3 Session lifetime

The cookies, `at=` token and `Bgr` token expire at unknown times. A
`session_expired` error stops the run with "Paste a fresh session cURL". Any
Google Flights search works as a session; its route doesn't matter.

### 1.4 Known Phase 08 parser issues, fixed here first

Seen in the live answers:

- Google streams the flight list several times in one answer (5 payloads, 3 of
  them with the same 16–17 flights). `parseShoppingResults` reads them all, so
  a row reports 34 flights for 17. The records are de-duplicated, but the
  count is wrong.
- Carbon emissions are present but set to `null`.

---

## 2 — Architecture

```
SessionCurlPanel (home, above the per-search rows)
  textarea: one session cURL  →  prepareCurl(text, { mode: "template" })
  query from SearchPanel  →  planSearches(query) → planRequestBatches(plan)
      = [{ direction, departureId: "ATH,SKG,HER", arrivalId: "LHR,LGW,…", date }, …]
  "This trip needs N Google requests (~M min)"  → confirm → run
        │ one POST per batch, sequential (shared runner with Phase 08)
        ▼
POST /api/airsearcher/curl   { curl, search: { from[], to[], date } }
  1. prepareCurl(curl, { mode: "template" })   — same allowlist
  2. validateSearch(search)                    — IATA, ≤ 7 per side, ISO date, not past
  3. hourlyCap.check()                          — CURL_MAX_PER_HOUR
  4. rewriteSearch(body, search) → new body     — freq.ts
  5. gate.run(runCurl(...))                     — unchanged pacing
  6. parseShoppingResults → flights             — fixed (§5)
        ▼
recordsFromCurlFlights(query, flights)  — unchanged: attributes by airport+date
→ runCurlSearch(...)  — unchanged → /results?source=google-curl
```

Everything after the request is Phase 08 code, unchanged. Batching works
without new matching logic: `recordsFromCurlFlights` already files each flight
by its own first departure, last arrival and date. That is exactly how SerpApi
batches are split in `flightRecordsFromResponses`.

---

## 3 — Rewriting the search: `app/lib/airsearcher/curl/freq.ts`

Add `rewriteSearch(body: string, search: GeneratedSearch): string`. It is pure,
so it's testable offline.

```ts
interface GeneratedSearch {
  from: AirportCode[];   // 1..7
  to: AirportCode[];     // 1..7
  date: string;          // YYYY-MM-DD
}
```

Steps, based on the live body structure (`[null, "<search JSON>"]`):

1. Parse `f.req` → `outer`, then `JSON.parse(outer[1])` → `search`.
2. `search[1][2] = 2` (one-way).
3. `search[1][6] = [1, 0, 0, 0]` (1 adult).
4. `search[1][13] = [leg]`. `leg` is a copy of the template's first leg
   (so its stops/other fields stay as the browser sent them), with:
   - `leg[0] = [from.map((code) => [code, 0])]`
   - `leg[1] = [to.map((code) => [code, 0])]`
   - `leg[6] = date`

   Place type `0` = airport. This is inferred: the template uses `4`/`5` for
   Google city ids. Task 0 confirms it.
5. `search[0][3]`, the search token: kept or set to `null`, **whichever Task 0
   shows works**. It's a named constant, so the choice is visible.
6. Re-encode: `outer[1] = JSON.stringify(search)`, then set `f.req` in the form
   body. `at=` and every other field are kept byte-for-byte.
7. If the template's shape isn't recognised, throw
   `CurlError("template_unrecognised", "This cURL can't be used as a session — copy a GetShoppingResults request.")`.

In `validate.ts`, `prepareCurl(text, { mode: "template" })` is the same as
today, except that a **round-trip template is allowed**, because its search is
replaced anyway. The URL/flag/body rules stay.

The URL's `_reqid` goes up by 100000 per generated request, as the browser
does. It's a small helper in `args.ts`, and the URL stays inside the allowed
prefix.

---

## 4 — Server: `app/api/airsearcher/curl/route.ts` (Phase 08 file)

⚠ This is under `app/api/`. The project rules require the user's go-ahead
before touching it (see Open items).

- Accept an optional `search: { from, to, date }`. Without it the route
  behaves exactly as today (Phase 08 fallback rows).
- `validateSearch`: every code matches `/^[A-Z]{3}$/`, 1–7 codes per side, no
  code on both sides, date is ISO and not before today. Otherwise
  `CurlError("parse_error", …)`.
- **Hourly cap** (`server/hourlyCap.ts`): a rolling list of timestamps on the
  same `globalThis` object as the gate. When full it returns
  `CurlError("cooling_down", "Hourly limit of 60 generated requests reached. Try again in N min.")`.
  It counts only **generated** searches; fallback rows keep the current rules.
- New config in `config/curl.ts`:
  `CURL_MAX_PER_HOUR = 60`, `CURL_REQID_STEP = 100_000`.

---

## 5 — Parser fixes: `app/lib/airsearcher/curl/shopping.ts`

- **Duplicates:** read flights from the **last** payload that contains any
  flight items, not from all of them. The live answers show that payload is
  complete.
- **Emissions:** `details[22][7]` → `carbonEmissionsGrams`, `details[22][3]`
  → `carbonDifferencePercent` (confirmed in the live answer: e.g. 161000 g, −17 %).
- **Layovers** are still unverified: every live flight so far was direct.
  Task 0's second request uses SKG → London, which usually has connections;
  its answer becomes the layover check.

---

## 6 — UI: `app/components/airsearcher/home/curl/`

| File | Change |
| --- | --- |
| `SessionCurlPanel.tsx` (new) | One text area "Session cURL", the row check line (reuses `CurlRow`'s status logic), the plan summary "N Google requests · ~M min" from `planRequestBatches(planSearches(query))`, and "Search with Google" / Stop buttons |
| `useCurlRun.ts` | Extract the sequential loop into `runSequence(jobs, send, onStatus)`. Phase 08 rows and the session run both use it. Session jobs are `{ label: "ATH,SKG → LHR,LGW · 8 Oct · going", search }` |
| `CurlRequestsPanel.tsx` | Renders `SessionCurlPanel` first, then the existing rows under a "Or paste each search yourself" heading |
| `CurlCoverage.tsx` | During a session run, shows per-batch progress (waiting / sending / N flights / failed) instead of only per route |

Behaviour:

- **Nothing is sent until the user confirms.** The dialog reuses
  `explainCost(plan)` grouping (going / returning) with Google wording, plus the
  time estimate: N × (10 s + average jitter).
- More than `CURL_MAX_PER_RUN` (20) batches: the button is disabled with
  "This trip needs N requests; the limit is 20. Narrow the date range."
- Top inputs invalid (no destination, no passengers, bad dates): the button is
  disabled with the same messages `SearchPanel` uses (`dateError`, …).
- Editing the top inputs updates the plan and count live; the session cURL
  stays.
- Styling as in Phase 08: `Button`, `Text`, theme tokens, raw `<textarea>`.

---

## 7 — Testing (live request budget: at most 5)

**Task 0, the feasibility test, run first. At most 3 live requests, each ≥ 10 s
apart, using the user's pasted one-way cURL as the template:**

| # | Change to the template | Pass means |
| --- | --- | --- |
| T1 | Date only (8 Oct → 9 Oct), everything else as copied | Changed searches are accepted, and flights on 9 Oct come back |
| T2 | Airports as IATA lists: `SKG,ATH → LHR,LGW`, 9 Oct | IATA + type 0 and several airports per side work; layovers get checked |
| T3 | *Only if T1 fails:* T1 with the search token set to `null` | The token was the cause |

The responses are saved as fixtures (body only) in `scripts/airsearcher/.cache/`
(gitignored). T1 and T3 both failing → **stop the phase** and report.

**Offline (no network):**
- `rewriteSearch` → `decodeSearch` round trip: one-way, 1 adult, the right
  places and date, the `at=` token unchanged, and the template's other leg
  fields kept.
- `validateSearch`: bad codes, > 7 airports, a code on both sides, a past date.
- Hourly cap on a fake clock.
- Parser: a fixture with 3 duplicate payloads → 17 flights, not 34; emissions
  read; the T2 fixture → layovers read.
- Batches for a sample group query equal what `costOf` reports for SerpApi.

**Live end-to-end (1–2 requests):** exact round trip ATH+SKG+HER → London,
8–17 Oct = 2 batches → the results page shows arrangements on the "Google
(cURL)" tab.

Also: `tsc`, lint, the existing 58 + 25 checks, and a screenshot of the panel at
mobile and desktop widths.

---

## 8 — Task list

| # | Task | Files |
| --- | --- | --- |
| 0 | **Feasibility test T1–T3** (≤ 3 live requests) → go/no-go, pick the token/place encoding | scratch script, fixtures in `scripts/airsearcher/.cache/` |
| 1 | Parser: last payload only, emissions, layovers checked against the T2 fixture | `curl/shopping.ts` |
| 2 | `rewriteSearch`, template mode in `prepareCurl`, `_reqid` step | `curl/freq.ts`, `curl/validate.ts`, `curl/args.ts` |
| 3 | Config: `CURL_MAX_PER_HOUR`, `CURL_REQID_STEP` | `config/curl.ts` |
| 4 | Route: optional `search`, `validateSearch`, hourly cap | `app/api/airsearcher/curl/route.ts`, `curl/server/hourlyCap.ts` |
| 5 | Client API: send `search` | `curl/api.ts` |
| 6 | Shared runner, extracted from `useCurlRun` | `home/curl/useCurlRun.ts` |
| 7 | `SessionCurlPanel` + confirmation + panel order + coverage progress | `home/curl/*` |
| 8 | Offline checks | `__checks__/curl.ts` |
| 9 | Live end-to-end (1–2 requests), tsc, lint, screenshots | — |

Files **not** touched: `app/config/**`, `app/framework/**`, every other
`app/api/**` route, `prisma/`, the SerpApi and Travelpayouts code paths, and
`recordsFromCurlFlights` / `runCurlSearch` (reused as they are).

---

## 9 — Open items

1. **Permission for `app/api/airsearcher/curl/route.ts`**: the project rules
   need your OK to change a file under `app/api/`. Approving this plan counts
   as that OK, unless you say otherwise.
2. **A fresh one-way cURL for Task 0.** The ones pasted so far have probably
   expired.
3. **Hourly cap:** 60 generated requests per hour. Keep it, or lower it?
4. **If Task 0 fails:** should the fallback improvement (flag rows whose route or
   date doesn't fit the trip before sending) become its own small plan?
