/**
 * Offline checks for the Google Flights cURL runner.
 *
 * Run with `npx tsx app/lib/airsearcher/__checks__/curl.ts`. Nothing here
 * touches the network: every cURL and every Google response is synthetic, and
 * the pacing gate runs on a fake clock. None of it holds a real session.
 */

import assert from "node:assert/strict";

import { buildCurlArgs, META_MARKER, splitCurlOutput, withRequestId } from "@/lib/airsearcher/curl/args";
import { generatedJobsFor, sessionRequestsFor, validateSearch } from "@/lib/airsearcher/curl/generated";
import { planSchedule, retryDelayMs } from "@/lib/airsearcher/pacing";
import { airports, googleFlightsSearchUrl, tfsFor } from "@/lib/airsearcher/curl/googleLink";
import { createHourlyCap } from "@/lib/airsearcher/curl/server/hourlyCap";
import { checkResponse, errorForExitCode } from "@/lib/airsearcher/curl/classify";
import { CurlError, type CurlErrorCode } from "@/lib/airsearcher/curl/errors";
import { decodeSearch, freqOf, rewriteSearch } from "@/lib/airsearcher/curl/freq";
import { parseCurl } from "@/lib/airsearcher/curl/parse";
import { recordsFromCurlFlights } from "@/lib/airsearcher/curl/records";
import { createGate } from "@/lib/airsearcher/curl/server/gate";
import { parseShoppingResults, payloadsOf } from "@/lib/airsearcher/curl/shopping";
import { tokenizeCurl } from "@/lib/airsearcher/curl/tokenize";
import { prepareCurl } from "@/lib/airsearcher/curl/validate";
import type { SearchQuery } from "@/lib/airsearcher/types";

let passed = 0;
async function check(name: string, fn: () => void | Promise<void>): Promise<void> {
  try {
    await fn();
    passed++;
    console.log(`  ok  ${name}`);
  } catch (error) {
    console.error(`FAIL  ${name}`);
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

function throwsCode(fn: () => unknown, code: CurlErrorCode): void {
  assert.throws(fn, (error: unknown) => error instanceof CurlError && error.code === code);
}

/* ── Fixtures ────────────────────────────────────────────────────────────── */

const URL_BASE =
  "https://www.google.com/_/FlightsFrontendUi/data/travel.frontend.flights.FlightsFrontendService/GetShoppingResults?f.sid=1&hl=en-GB&rt=c";

function searchBody(tripType: number, legs: [string, string, string][], adults = 1): string {
  const inner = [
    [],
    [
      null, null, tripType, null, [], 1, [adults, 0, 0, 0], null, null, null, null, null, null,
      legs.map(([from, to, date]) => [[[[from, 0]]], [[[to, 0]]], null, 0, null, null, date]),
    ],
    1, 0, 0, 1,
  ];
  const freq = JSON.stringify([null, JSON.stringify(inner)]);
  return `f.req=${encodeURIComponent(freq)}&at=FAKE_TOKEN%3A1&`;
}

const ONE_WAY = searchBody(2, [["ATH", "LHR", "2026-10-08"]]);
const HEADERS_POSIX = [
  "-H 'Accept: */*'",
  "-H 'Accept-Encoding: gzip, deflate, br, zstd'",
  "-H 'Content-Length: 653'",
  `-H 'x-goog-ext-259736195-jspb: ["en-GB","GR","EUR",1,null,[-180],null,null,1,[]]'`,
  "-H 'Cookie: FAKE=1; OTHER=2'",
].join(" \\\n  ");

const POSIX = `curl '${URL_BASE}' \\\n  -X POST \\\n  ${HEADERS_POSIX} \\\n  --data-raw '${ONE_WAY}'`;

/** The same request as Chrome's "Copy as cURL (cmd)" writes it. */
function cmdQuote(value: string): string {
  return `^"${value.replace(/"/g, '\\^"').replace(/%/g, "^%").replace(/&/g, "^&")}^"`;
}
const CMD = [
  `curl ${cmdQuote(URL_BASE)}`,
  "-X POST",
  `-H ${cmdQuote("Accept: */*")}`,
  `-H ${cmdQuote('x-goog-ext-259736195-jspb: ["en-GB","GR","EUR",1,null,[-180],null,null,1,[]]')}`,
  `-H ${cmdQuote("Cookie: FAKE=1; OTHER=2")}`,
  `--data-raw ${cmdQuote(ONE_WAY)}`,
].join(" ^\n  ");

/** A 23-slot segment with the positions the parser reads. */
function segment(from: string, to: string, dep: [number, number], arr: [number, number], number: string) {
  const s: unknown[] = new Array(23).fill(null);
  s[3] = from;
  s[4] = `${from} airport`;
  s[5] = `${to} airport`;
  s[6] = to;
  s[8] = dep;
  s[10] = arr;
  s[11] = 150;
  s[17] = "Airbus A320";
  s[20] = [2026, 10, 8];
  s[21] = [2026, 10, 8];
  s[22] = ["A3", number, null, "Aegean"];
  return s;
}

function item(segments: unknown[][], price: number | null) {
  const details: unknown[] = new Array(14).fill(null);
  details[0] = "A3";
  details[1] = ["Aegean"];
  details[2] = segments;
  details[9] = 205;
  details[13] = segments.length > 1 ? [[55, "FRA", "Frankfurt", null, "Frankfurt Airport"]] : null;
  return [details, [[null, price], "booking-token"]];
}

function response(payload: unknown): string {
  const envelope = JSON.stringify([["wrb.fr", null, JSON.stringify(payload)]]);
  return `)]}'\n\n${envelope.length}\n${envelope}\n25\n[["di",42],["af.httprm",41]]\n`;
}

const PAYLOAD = [
  null,
  null,
  [[item([segment("ATH", "LHR", [7, 5], [9, 30], "600")], 240)]],
  [[
    item([segment("ATH", "FRA", [6, 0], [8, 0], "800"), segment("FRA", "LHR", [8, 55], [9, 40], "900")], 180),
    item([segment("ATH", "LGW", [12, 0], [14, 20], "602")], null),
  ]],
];

/* ── Tokenizing and parsing ──────────────────────────────────────────────── */

async function main() {
  await check("POSIX cURL parses: method, url, body, headers", () => {
    const parsed = parseCurl(POSIX);
    assert.equal(parsed.method, "POST");
    assert.equal(parsed.url, URL_BASE);
    assert.equal(parsed.body, ONE_WAY);
    assert.ok(parsed.headers.some(([n, v]) => n === "Cookie" && v === "FAKE=1; OTHER=2"));
  });

  await check("cmd (Windows) cURL parses to exactly the same request", () => {
    assert.deepEqual(parseCurl(CMD).body, parseCurl(POSIX).body);
    assert.equal(parseCurl(CMD).url, URL_BASE);
    assert.equal(
      parseCurl(CMD).headers.find(([n]) => n.startsWith("x-goog"))?.[1],
      '["en-GB","GR","EUR",1,null,[-180],null,null,1,[]]',
    );
  });

  await check("$'…' ANSI-C quoting and curl.exe are understood", () => {
    const tokens = tokenizeCurl(`curl.exe $'a\\'b\\nc' "d \\"e\\""`);
    assert.deepEqual(tokens.slice(1), ["a'b\nc", 'd "e"']);
  });

  await check("PowerShell and non-curl commands are refused", () => {
    throwsCode(() => tokenizeCurl('Invoke-WebRequest -Uri "https://x"'), "powershell");
    throwsCode(() => tokenizeCurl("wget https://x"), "not_curl");
    throwsCode(() => tokenizeCurl("   "), "empty");
    throwsCode(() => tokenizeCurl("curl 'unclosed"), "parse_error");
  });

  await check("dangerous flags are refused by name", () => {
    throwsCode(() => parseCurl(`curl '${URL_BASE}' -o out.txt`), "flag_not_allowed");
    throwsCode(() => parseCurl(`curl '${URL_BASE}' -K cfg`), "flag_not_allowed");
    throwsCode(() => parseCurl(`curl '${URL_BASE}' --data @secrets.txt`), "flag_not_allowed");
    throwsCode(() => parseCurl(`curl '${URL_BASE}' -b cookies.txt`), "flag_not_allowed");
    throwsCode(() => parseCurl(`curl '${URL_BASE}' -X DELETE`), "flag_not_allowed");
  });

  /* ── Validation ────────────────────────────────────────────────────────── */

  await check("a valid one-way cURL is prepared: route read, headers dropped, currency found", () => {
    const prepared = prepareCurl(POSIX);
    assert.equal(prepared.search?.tripType, "one-way");
    assert.deepEqual(prepared.search?.legs, [{ from: ["ATH"], to: ["LHR"], date: "2026-10-08" }]);
    assert.equal(prepared.currency, "EUR");
    const names = prepared.headers.map(([n]) => n.toLowerCase());
    assert.ok(!names.includes("content-length"));
    assert.ok(!names.includes("accept-encoding"));
    assert.ok(names.includes("cookie"));
  });

  await check("a POST without a body (like the pasted sample) is refused before sending", () => {
    throwsCode(() => prepareCurl(`curl '${URL_BASE}' -X POST -H 'Content-Length: 653'`), "missing_body");
  });

  await check("round-trip searches are refused, one-way accepted", () => {
    const roundTrip = searchBody(1, [["ATH", "LHR", "2026-10-08"], ["LHR", "ATH", "2026-10-17"]]);
    throwsCode(() => prepareCurl(`curl '${URL_BASE}' --data-raw '${roundTrip}'`), "round_trip");
  });

  await check("only Google Flights GetShoppingResults may be run", () => {
    throwsCode(() => prepareCurl(`curl 'https://example.com/x' --data-raw 'f.req=1'`), "url_not_allowed");
    throwsCode(
      () => prepareCurl(`curl 'http://www.google.com/_/FlightsFrontendUi/data/travel.frontend.flights.FlightsFrontendService/GetShoppingResults' --data-raw '${ONE_WAY}'`),
      "url_not_allowed",
    );
    throwsCode(
      () => prepareCurl(`curl '${URL_BASE.replace("GetShoppingResults", "GetCalendarGraph")}' --data-raw '${ONE_WAY}'`),
      "rpc_not_supported",
    );
  });

  await check("the fingerprint ignores the session token, so repeats are detected", () => {
    const other = POSIX.replace("FAKE_TOKEN", "OTHER_TOKEN").replace("FAKE=1", "FAKE=9");
    assert.equal(prepareCurl(other).fingerprint, prepareCurl(POSIX).fingerprint);
  });

  await check("passenger count is read so prices can be divided back to one", () => {
    assert.equal(decodeSearch(searchBody(2, [["ATH", "LHR", "2026-10-08"]], 3))?.passengers, 3);
    assert.equal(decodeSearch("at=x"), null);
  });

  /* ── curl arguments and outcomes ───────────────────────────────────────── */

  await check("curl args are rebuilt from validated fields, with a status trailer", () => {
    const args = buildCurlArgs(prepareCurl(POSIX), { timeoutMs: 30_000, maxBytes: 1000 });
    assert.ok(args.includes("--compressed"));
    assert.equal(args[args.indexOf("--max-time") + 1], "30");
    assert.equal(args[args.indexOf("--data-raw") + 1], ONE_WAY);
    assert.equal(args[args.length - 1], URL_BASE);
    assert.ok(!args.some((a) => /content-length/i.test(a)));
  });

  await check("a header with a line break can't smuggle another in", () => {
    const prepared = { ...prepareCurl(POSIX), headers: [["X-A", "1\r\nX-B: 2"]] as [string, string][] };
    throwsCode(() => buildCurlArgs(prepared, { timeoutMs: 1000, maxBytes: 1 }), "parse_error");
  });

  await check("curl output splits into body and status", () => {
    const out = splitCurlOutput(`)]}'\nbody${META_MARKER}200\tapplication/json\t`);
    assert.equal(out.body, ")]}'\nbody");
    assert.equal(out.httpStatus, 200);
  });

  await check("responses are classified: rate limit, captcha, session, HTTP errors", () => {
    const base = { body: "", contentType: "", redirectUrl: "" };
    throwsCode(() => checkResponse({ ...base, httpStatus: 429 }), "rate_limited");
    throwsCode(() => checkResponse({ ...base, httpStatus: 302, redirectUrl: "https://www.google.com/sorry/index?x" }), "rate_limited");
    throwsCode(() => checkResponse({ ...base, httpStatus: 200, body: "<html>Our systems have detected unusual traffic</html>" }), "rate_limited");
    throwsCode(() => checkResponse({ ...base, httpStatus: 403 }), "session_expired");
    throwsCode(() => checkResponse({ ...base, httpStatus: 500 }), "http_error");
    checkResponse({ ...base, httpStatus: 200, body: ")]}'" });
    assert.equal(errorForExitCode(28).code, "timeout");
    assert.equal(errorForExitCode(6).code, "network");
    assert.equal(errorForExitCode(6).toInfo().stopRun, true);
    assert.equal(errorForExitCode(28).toInfo().stopRun, false);
  });

  /* ── Response parsing ──────────────────────────────────────────────────── */

  await check("flights are read from the chunked RPC answer, best and other", () => {
    const { flights, unpriced } = parseShoppingResults(response(PAYLOAD), { currency: "EUR", passengers: 1 });
    assert.equal(flights.length, 3);
    assert.equal(unpriced, 1);

    const direct = flights.find((f) => f.category === "best")!;
    assert.equal(direct.price, 240);
    assert.equal(direct.outbound.segments[0].departure.time, "2026-10-08 07:05");
    assert.equal(direct.outbound.segments[0].flightNumber, "A3 600");
    assert.equal(direct.airline.name, "Aegean");

    const connecting = flights.find((f) => f.outbound.segments.length === 2)!;
    assert.equal(connecting.category, "other");
    assert.equal(connecting.outbound.stops, 1);
    assert.equal(connecting.outbound.layovers[0].airport, "FRA");
    assert.equal(connecting.outbound.segments[1].arrival.airport, "LHR");
  });

  await check("prices quoted for a party are divided back to one passenger", () => {
    const { flights } = parseShoppingResults(response(PAYLOAD), { currency: "EUR", passengers: 2 });
    assert.equal(flights.find((f) => f.category === "best")!.price, 120);
  });

  await check("an unrecognised or failed answer is an error, not zero flights", () => {
    throwsCode(() => payloadsOf("<html>hello</html>"), "unrecognised_response");
    throwsCode(() => payloadsOf(`)]}'\n\n40\n[["wrb.fr",null,null,null,null,[3]]]\n`), "session_expired");
    assert.equal(parseShoppingResults(response([null, null, [], []]), { currency: "EUR", passengers: 1 }).flights.length, 0);
  });

  /* ── Records ───────────────────────────────────────────────────────────── */

  await check("flights are filed under the planned routes; others are reported", () => {
    const query: SearchQuery = {
      destinations: [{ cityId: "gb-london", airports: ["LHR", "LGW"] }],
      origins: [{ airport: "ATH", passengers: 2 }],
      gatheringAirport: "ATH",
      tripType: "one-way",
      dateMode: "exact",
      departureDate: "2026-10-08",
      returnDate: null,
      dateRange: null,
      tripDurationDays: null,
      excludedDates: [],
      priorityDates: {},
    };
    const { flights } = parseShoppingResults(response(PAYLOAD), { currency: "EUR", passengers: 1 });
    const stray = { ...flights[0], outbound: { ...flights[0].outbound, segments: flights[0].outbound.segments.map((s) => ({ ...s, arrival: { ...s.arrival, airport: "STN" } })) } };

    const { records, ignored } = recordsFromCurlFlights(query, [...flights, stray]);
    const lhr = records.find((r) => r.to === "LHR")!;
    const lgw = records.find((r) => r.to === "LGW")!;
    assert.equal(lhr.flights.length, 2);
    assert.equal(lhr.direction, "outbound");
    assert.equal(lgw.flights.length, 1);
    assert.deepEqual(ignored, [{ route: "ATH→STN 2026-10-08", flights: 1 }]);
  });

  /* ── Pacing gate (fake clock — never contacts Google) ──────────────────── */

  function fakeGate(random = 0.5) {
    let clock = 1_000_000;
    const sleeps: number[] = [];
    const gate = createGate({
      minIntervalMs: 10_000,
      jitterMs: 3_000,
      coolDownMs: 600_000,
      now: () => clock,
      sleep: async (ms) => {
        sleeps.push(ms);
        clock += ms;
      },
      random: () => random,
    });
    return { gate, sleeps, advance: (ms: number) => (clock += ms) };
  }

  await check("the first request goes straight away; the next waits min + jitter", async () => {
    const { gate, sleeps, advance } = fakeGate(0.5);
    await gate.run(async () => advance(2_000));
    const second = await gate.run(async () => "ok");
    assert.deepEqual(sleeps, [11_500]);
    assert.equal(second.waitedMs, 11_500);
  });

  await check("the gap counts from when the previous request finished", async () => {
    const { gate, sleeps, advance } = fakeGate(0);
    await gate.run(async () => advance(25_000)); // a slow answer
    advance(4_000);
    await gate.run(async () => null);
    assert.deepEqual(sleeps, [6_000]);
  });

  await check("concurrent requests are serialised, never burst", async () => {
    const { gate, sleeps } = fakeGate(0);
    await Promise.all([gate.run(async () => 1), gate.run(async () => 2), gate.run(async () => 3)]);
    assert.deepEqual(sleeps, [10_000, 10_000]);
  });

  await check("a failed request still counts for the gap", async () => {
    const { gate, sleeps } = fakeGate(0);
    await gate.run(async () => { throw new Error("boom"); }).catch(() => null);
    await gate.run(async () => null);
    assert.deepEqual(sleeps, [10_000]);
  });

  await check("after a rate limit the gate refuses until the cool-down ends", async () => {
    const { gate, advance } = fakeGate(0);
    gate.startCoolDown();
    await assert.rejects(gate.run(async () => null), (e: unknown) => e instanceof CurlError && e.code === "cooling_down");
    advance(600_001);
    await gate.run(async () => null);
  });

  await check("an aborted request is never sent", async () => {
    const { gate } = fakeGate(0);
    const controller = new AbortController();
    controller.abort();
    let sent = false;
    await assert.rejects(gate.run(async () => { sent = true; }, controller.signal));
    assert.equal(sent, false);
  });

  /* ── Session template (plan 09) ─────────────────────────────────────────── */

  const ROUND_TRIP_BODY = searchBody(1, [["ATH", "LHR", "2026-10-08"], ["LHR", "ATH", "2026-10-17"]], 2);
  const ROUND_TRIP_CURL = `curl '${URL_BASE}&_reqid=500' -H 'x-goog-ext-259736195-jspb: ["en-GB","GR","USD",1]' --data-raw '${ROUND_TRIP_BODY}'`;

  await check("a round-trip cURL is refused as a search but accepted as a session", () => {
    throwsCode(() => prepareCurl(ROUND_TRIP_CURL), "round_trip");
    assert.equal(prepareCurl(ROUND_TRIP_CURL, { mode: "template" }).search?.tripType, "round-trip");
  });

  await check("a session's currency is forced to the app's EUR, language kept", () => {
    const prepared = prepareCurl(ROUND_TRIP_CURL, { mode: "template" });
    assert.equal(prepared.currency, "EUR");
    const locale = prepared.headers.find(([n]) => n.startsWith("x-goog"))![1];
    assert.equal(locale, '["en-GB","GR","EUR",1]');
  });

  await check("the rewritten search comes only from the inputs: one-way, 1 adult, IATA lists, date", () => {
    const body = rewriteSearch(ROUND_TRIP_BODY, { from: ["ATH", "SKG"], to: ["LHR", "LGW"], date: "2026-10-09" });
    const decoded = decodeSearch(body)!;
    assert.equal(decoded.tripType, "one-way");
    assert.equal(decoded.passengers, 1);
    assert.deepEqual(decoded.legs, [{ from: ["ATH", "SKG"], to: ["LHR", "LGW"], date: "2026-10-09" }]);
    // Sent anonymously: the signed-in `at=` token is dropped.
    assert.equal(new URLSearchParams(body).get("at"), null);
  });

  await check("the rewritten search asks for the first page or every flight, without a search token", () => {
    const inner = (list?: "first" | "all") =>
      JSON.parse(JSON.parse(freqOf(rewriteSearch(ROUND_TRIP_BODY, { from: ["ATH"], to: ["LHR"], date: "2026-10-09", list }))!)[1]);
    assert.deepEqual(inner("first")[0], []);
    assert.equal(inner("first")[3], 0);
    assert.equal(inner("all")[3], 1);
    assert.equal(inner()[3], 1);
  });

  await check("a session cURL is sent without its cookies; a pasted search keeps them", () => {
    const signedIn = `${ROUND_TRIP_CURL} -H 'Cookie: SID=secret' -b 'NID=also-secret' -H 'X-Goog-AuthUser: 0'`;
    const names = (mode: "search" | "template") =>
      prepareCurl(signedIn, { mode }).headers.map(([name]) => name.toLowerCase());
    assert.ok(!names("template").some((name) => ["cookie", "x-goog-authuser"].includes(name)));
    const oneWay = `curl '${URL_BASE}&_reqid=500' -H 'Cookie: SID=secret' --data-raw '${ONE_WAY}'`;
    assert.ok(prepareCurl(oneWay).headers.some(([name]) => name === "Cookie"));
  });

  await check("filters set on the copied search never carry over", () => {
    // A template with "nonstop only" (stops = 1) and business class (3).
    const inner = JSON.parse(JSON.parse(freqOf(ONE_WAY)!)[1]);
    inner[1][5] = 3;
    inner[1][13][0][3] = 1;
    const filtered = `f.req=${encodeURIComponent(JSON.stringify([null, JSON.stringify(inner)]))}&at=x&`;
    const rebuilt = JSON.parse(JSON.parse(freqOf(rewriteSearch(filtered, { from: ["ATH"], to: ["LHR"], date: "2026-10-09" }))!)[1]);
    assert.equal(rebuilt[1][5], 1);
    assert.equal(rebuilt[1][13][0][3], 0);
  });

  await check("an unusable template body is refused", () => {
    throwsCode(() => rewriteSearch("at=x", { from: ["ATH"], to: ["LHR"], date: "2026-10-09" }), "template_unrecognised");
  });

  await check("the request id moves on per generated search", () => {
    const url = withRequestId(`${URL_BASE}&_reqid=500`, 2, 100_000);
    assert.equal(new URL(url).searchParams.get("_reqid"), "300500");
    assert.equal(withRequestId(URL_BASE, 2, 100_000), URL_BASE);
  });

  await check("searches sent by the browser are checked before use", () => {
    const ok = validateSearch({ from: ["ATH"], to: ["LHR"], date: "2026-10-09" }, "2026-09-27");
    assert.deepEqual(ok.to, ["LHR"]);
    throwsCode(() => validateSearch({ from: ["ath"], to: ["LHR"], date: "2026-10-09" }, "2026-09-27"), "parse_error");
    throwsCode(() => validateSearch({ from: ["ATH"], to: ["ATH"], date: "2026-10-09" }, "2026-09-27"), "parse_error");
    throwsCode(() => validateSearch({ from: ["ATH"], to: ["LHR"], date: "2026-09-01" }, "2026-09-27"), "parse_error");
    throwsCode(
      () => validateSearch({ from: ["AAA", "BBB", "CCC", "DDD", "EEE", "FFF", "GGG", "HHH"], to: ["LHR"], date: "2026-10-09" }, "2026-09-27"),
      "parse_error",
    );
  });

  const GROUP_QUERY: SearchQuery = {
    destinations: [{ cityId: "uk-london", airports: ["LHR", "LGW", "LTN", "STN"] }],
    origins: [
      { airport: "ATH", passengers: 4 },
      { airport: "SKG", passengers: 3 },
      { airport: "HER", passengers: 2 },
    ],
    gatheringAirport: "ATH",
    tripType: "round-trip",
    dateMode: "exact",
    departureDate: "2026-10-08",
    returnDate: "2026-10-17",
    dateRange: null,
    tripDurationDays: null,
    excludedDates: [],
    priorityDates: {},
  };

  await check("a gathering group round trip: main and feeder searches apart, all valid", () => {
    const jobs = generatedJobsFor(GROUP_QUERY);
    // Going: main/direct + feeder hops; returning: the same. Four in all.
    assert.equal(jobs.length, 4);
    assert.deepEqual(jobs.map((j) => j.direction), ["outbound", "outbound", "return", "return"]);
    assert.deepEqual(jobs[0].search.from, ["ATH", "HER", "SKG"]);
    assert.deepEqual(jobs[0].search.to, ["LGW", "LHR", "LTN", "STN"]);
    assert.deepEqual(jobs[1].search, { from: ["HER", "SKG"], to: ["ATH"], date: "2026-10-08" });
    assert.equal(jobs[3].search.date, "2026-10-17");
    // Every generated search passes the server's own check.
    for (const job of jobs) validateSearch(job.search, "2026-09-28");
  });

  await check("a run's waits: 5–12 s gaps, and searches ÷ (5–20) longer pauses of 20–90 s", () => {
    for (let trial = 0; trial < 500; trial++) {
      const count = 1 + Math.floor(Math.random() * 60);
      const plan = planSchedule(count);
      assert.equal(plan.delaysMs.length, count);
      assert.equal(plan.delaysMs[0], 0);
      assert.ok(plan.divisor >= 5 && plan.divisor <= 20);
      assert.equal(plan.pauseAt.size, Math.min(count - 1, Math.ceil(count / plan.divisor)));
      plan.delaysMs.slice(1).forEach((ms, i) => {
        const [min, max] = plan.pauseAt.has(i + 1) ? [20_000, 90_000] : [5_000, 12_000];
        assert.ok(ms >= min && ms <= max, `wait ${ms} outside ${min}–${max}`);
      });
      assert.ok(!plan.pauseAt.has(0));
    }
    // 50 searches: between ceil(50/20) = 3 and 50/5 = 10 longer pauses.
    assert.equal(planSchedule(50, () => 0).pauseAt.size, 10);
    assert.equal(planSchedule(50, () => 0.9999).pauseAt.size, 3);
    assert.equal(planSchedule(1).pauseAt.size, 0);
  });

  await check("a refused search is retried after 40–80 s", () => {
    for (let trial = 0; trial < 500; trial++) {
      const ms = retryDelayMs();
      assert.ok(ms >= 40_000 && ms <= 80_000, `retry wait ${ms} outside 40–80 s`);
    }
    assert.equal(retryDelayMs(() => 0), 40_000);
    assert.equal(retryDelayMs(() => 0.99999999), 80_000);
  });

  await check("a run retries a refused search once and notes it in the warnings", async () => {
    // The runner waits with the page's timers; plain ones do here.
    (globalThis as { window?: unknown }).window ??= globalThis;
    const { runSequence } = await import("@/components/airsearcher/home/curl/curlRunner");
    const refused = { ok: false as const, error: { code: "session_expired" as const, message: "Google refused this request (error [13,null]).", stopRun: true } };
    const answered = { ok: true as const, flights: [], currency: "EUR", httpStatus: 200, waitedMs: 0, warnings: [] };

    // Refused, then fine on the retry: the run goes on and says so.
    let sends = 0;
    const statuses: string[] = [];
    const worked = await runSequence(
      [{ id: 0, label: "ATH → CDG", send: async () => (++sends === 1 ? refused : answered), retryAfterMs: () => 5 }],
      new AbortController().signal,
      (_, status) => statuses.push(status.kind === "pending" && status.retry ? "retry" : status.kind),
    );
    assert.equal(sends, 2);
    assert.equal(worked.succeeded, 1);
    assert.equal(worked.stoppedBecause, null);
    assert.ok(statuses.includes("retry"));
    assert.ok(worked.warnings.some((w) => w.startsWith("ATH → CDG: Google refused it (error 13); it worked when retried")));

    // Refused twice: only one retry, then the run stops as before.
    sends = 0;
    const failed = await runSequence(
      [
        { id: 0, label: "ATH → CDG", send: async () => (sends++, refused), retryAfterMs: () => 5 },
        { id: 1, label: "CDG → ATH", send: async () => answered },
      ],
      new AbortController().signal,
      () => {},
    );
    assert.equal(sends, 2);
    assert.equal(failed.succeeded, 0);
    assert.ok(failed.stoppedBecause);
    assert.ok(failed.warnings.some((w) => w.includes("failed again")));

    // No retry asked for: one try, as before.
    sends = 0;
    await runSequence([{ id: 0, label: "x", send: async () => (sends++, refused) }], new AbortController().signal, () => {});
    assert.equal(sends, 1);
  });

  await check("a one-cURL run sends each search once, as the full list", () => {
    const jobs = generatedJobsFor(GROUP_QUERY);
    const requests = sessionRequestsFor(GROUP_QUERY);
    assert.equal(requests.length, jobs.length);
    assert.ok(requests.every((r) => r.search.list === "all"));
    assert.deepEqual(requests.map((r) => r.label), jobs.map((j) => j.label));
    assert.equal(validateSearch({ from: ["ATH"], to: ["LHR"], date: "2026-10-09", list: "first" }, "2026-09-27").list, "first");
    throwsCode(() => validateSearch({ from: ["ATH"], to: ["LHR"], date: "2026-10-09", list: "x" }, "2026-09-27"), "parse_error");
  });

  await check("the hourly cap refuses the 61st generated search and frees up after an hour", () => {
    let clock = 0;
    const cap = createHourlyCap({ max: 60, windowMs: 3_600_000, now: () => clock });
    for (let i = 0; i < 60; i++) cap.take();
    throwsCode(() => cap.take(), "cooling_down");
    clock += 3_600_001;
    cap.take();
    assert.equal(cap.remaining(), 59);
  });

  await check("a list streamed several times is read once; emissions are read", () => {
    const details = item([segment("ATH", "LHR", [7, 5], [9, 30], "600")], 240);
    (details[0] as unknown[])[22] = [null, null, 1, -17, null, true, true, 161000, 194000];
    const payload = [null, null, [[details]], [[]]];
    const envelope = JSON.stringify([["wrb.fr", null, JSON.stringify(payload)]]);
    const streamed = `)]}'\n\n1\n${envelope}\n1\n${envelope}\n1\n${envelope}\n`;
    const { flights } = parseShoppingResults(streamed, { currency: "EUR", passengers: 1 });
    assert.equal(flights.length, 1);
    assert.equal(flights[0].carbonEmissionsGrams, 161000);
    assert.equal(flights[0].carbonDifferencePercent, -17);
  });

  await check("a connection that leaves on a later date is an overnight layover", () => {
    const second = segment("FCO", "LHR", [7, 50], [9, 40], "202");
    second[20] = [2026, 10, 9];
    second[21] = [2026, 10, 9];
    const overnight = item([segment("ATH", "FCO", [19, 30], [20, 40], "721"), second], 163);
    const same = item([segment("ATH", "FRA", [6, 0], [8, 0], "800"), segment("FRA", "LHR", [8, 55], [9, 40], "900")], 180);
    const { flights } = parseShoppingResults(response([null, null, [[overnight, same]], []]), { currency: "EUR", passengers: 1 });
    assert.equal(flights[0].outbound.layovers[0].overnight, true);
    assert.equal(flights[1].outbound.layovers[0].overnight, false);
  });

  await check("a Google Flights link encodes the search exactly like Google does", () => {
    // Taken from a link the browser produced: Athens → London, 16 Oct, one-way.
    const google = "CBwQAhonEgoyMDI2LTEwLTE2agsIAhIHL20vMG4yenIMCAMSCC9tLzA0anBsQAFIAXABggELCP___________wGYAQI";
    assert.equal(
      tfsFor({ from: [{ id: "/m/0n2z", type: 2 }], to: [{ id: "/m/04jpl", type: 3 }], date: "2026-10-16" }),
      google,
    );
    const url = new URL(googleFlightsSearchUrl({ from: airports(["ATH", "SKG"]), to: airports(["LHR"]), date: "2026-10-12" }));
    assert.equal(url.pathname, "/travel/flights/search");
    assert.equal(url.searchParams.get("curr"), "EUR");
    const decoded = Buffer.from(url.searchParams.get("tfs")!.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("latin1");
    for (const text of ["2026-10-12", "ATH", "SKG", "LHR"]) assert.ok(decoded.includes(text), text);
  });

  console.log(`\n${passed} checks passed.`);
}

void main();
