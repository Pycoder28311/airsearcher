/**
 * Logic checks for the AirSearcher lib layer.
 *
 * The project has no unit-test runner (Playwright covers end-to-end only), so
 * these are plain assertions run with `npx tsx app/lib/airsearcher/__checks__/run.ts`.
 * They cover the arithmetic and the group logic — everything that can be wrong
 * without the UI looking wrong.
 */

import assert from "node:assert/strict";

import { hourValue, priceIndex, normalizeWeights } from "@/lib/airsearcher/ranking";
import {
  buildArrangements,
  enumerateRoutings,
  poolKey,
  scoreArrangements,
  type FlightPool,
} from "@/lib/airsearcher/grouping";
import {
  planRequestBatches,
  planSearches,
  candidateDates,
} from "@/lib/airsearcher/queryPlan";
import { costOf, explainCost } from "@/lib/airsearcher/quota";
import {
  flightRecordsFromResponses,
  livePoolFromResponses,
  normalizeSerpApiResponse,
  poolFromRecords,
} from "@/lib/airsearcher/serpApi";
import { searchKeyOf } from "@/lib/airsearcher/searchKey";
import { loadSearches, loadFilters, loadPreferences } from "@/lib/airsearcher/storage";
import { toggleAirport, selectCity } from "@/lib/airsearcher/mapSelection";
import { mockFlightsFor, mockPool } from "@/lib/airsearcher/mockFlights";
import { DEFAULT_RANKING_CONFIG } from "@/lib/airsearcher/config/ranking";
import { MIN_GATHER_BUFFER_MINUTES } from "@/lib/airsearcher/config/constants";
import { EUROPE_CITIES_BY_ID } from "@/data/europeCities";
import { airportByCode } from "@/data/places";
import type { NormalizedFlight, SearchQuery } from "@/lib/airsearcher/types";

let passed = 0;
function check(name: string, fn: () => void): void {
  try {
    fn();
    passed++;
    console.log(`  ok  ${name}`);
  } catch (error) {
    console.error(`FAIL  ${name}`);
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

/* ── Ranking arithmetic (ported — must behave as the reference does) ─────── */

check("hourValue interpolates between adjacent bars", () => {
  const curve = Array.from({ length: 24 }, (_, i) => (i === 8 ? 0 : i === 9 ? 100 : 50));
  assert.equal(hourValue(curve, "2026-09-14 08:00"), 0);
  assert.equal(hourValue(curve, "2026-09-14 09:00"), 1);
  assert.equal(hourValue(curve, "2026-09-14 08:30"), 0.5);
});

check("hourValue wraps from bar 23 round to bar 0", () => {
  const curve = Array.from({ length: 24 }, (_, i) => (i === 23 ? 0 : i === 0 ? 100 : 50));
  assert.equal(hourValue(curve, "2026-09-14 23:30"), 0.5);
});

check("hourValue rejects an unusable time or curve", () => {
  assert.equal(hourValue(DEFAULT_RANKING_CONFIG.curves.outbound, null), null);
  assert.equal(hourValue([1, 2, 3], "2026-09-14 09:00"), null);
});

check("priceIndex scores everything 1 when all prices match", () => {
  assert.equal(priceIndex(200, 200, 200), 1);
  assert.equal(priceIndex(null, 100, 300), 0);
  assert.equal(priceIndex(100, 100, 300), 1);
  assert.equal(priceIndex(300, 100, 300), 0);
});

check("normalizeWeights splits evenly rather than dividing by zero", () => {
  assert.deepEqual(normalizeWeights({ price: 0, hour: 0 }), { price: 0.5, hour: 0.5 });
  assert.deepEqual(normalizeWeights({ price: 60, hour: 40 }), { price: 0.6, hour: 0.4 });
});

/* ── Routings ────────────────────────────────────────────────────────────── */

const ORIGINS = [
  { airport: "ATH", passengers: 10 },
  { airport: "SKG", passengers: 6 },
  { airport: "HER", passengers: 4 },
];

check("enumerateRoutings yields 2^(n-1) one-way and never routes the hub to itself", () => {
  const routings = enumerateRoutings(ORIGINS, "ATH", { direct: true, gather: true });
  assert.equal(routings.length, 4);
  for (const routing of routings) {
    assert.deepEqual(routing.ATH, { outbound: "direct", return: null });
  }
});

check("enumerateRoutings routes each direction separately on a round trip", () => {
  const routings = enumerateRoutings(ORIGINS, "ATH", { direct: true, gather: true }, true);
  assert.equal(routings.length, 16);
  assert.ok(
    routings.some((r) => r.SKG.outbound === "direct" && r.SKG.return === "gather"),
    "going direct and coming back via the hub must be a candidate",
  );
  for (const routing of routings) {
    assert.deepEqual(routing.ATH, { outbound: "direct", return: "direct" });
  }
});

check("enumerateRoutings collapses to one when only direct is allowed", () => {
  const routings = enumerateRoutings(ORIGINS, "ATH", { direct: true, gather: false });
  assert.equal(routings.length, 1);
});

/* ── Query planning — the SerpApi-minimisation requirement ──────────────── */

const QUERY: SearchQuery = {
  destination: { cityId: "de-berlin", airports: ["BER"] },
  origins: ORIGINS,
  gatheringAirport: "ATH",
  tripType: "round-trip",
  dateMode: "exact",
  departureDate: "2026-09-14",
  returnDate: "2026-09-21",
  dateRange: null,
  tripDurationDays: null,
  excludedDates: [],
  priorityDates: {},
};

check("planSearches shares one main leg across every gathering origin", () => {
  const plan = planSearches(QUERY);
  const mainOutbound = plan.filter(
    (s) => s.reason === "main" && s.direction === "outbound",
  );
  assert.equal(mainOutbound.length, 1, "ATH->BER must be searched exactly once");

  // 2 main (out + back) + 4 feeder (2 origins x 2 directions)
  // + 4 direct (2 origins x 2 directions) = 10
  assert.equal(plan.length, 10);
});

check("quota batches airports into one request per date and direction", () => {
  const plan = planSearches(QUERY);

  assert.equal(costOf(plan), 2);
  assert.deepEqual(planRequestBatches(plan), [
    {
      direction: "outbound",
      departureId: "ATH,HER,SKG",
      arrivalId: "ATH,BER",
      date: "2026-09-14",
    },
    {
      direction: "return",
      departureId: "ATH,BER",
      arrivalId: "ATH,HER,SKG",
      date: "2026-09-21",
    },
  ]);
  assert.deepEqual(explainCost(plan), [
    {
      reason: "outbound",
      label: "Combined outbound searches",
      count: 1,
    },
    {
      reason: "return",
      label: "Combined return searches",
      count: 1,
    },
  ]);
});

check("three round-trip candidate dates cost six combined requests", () => {
  const advanced: SearchQuery = {
    ...QUERY,
    dateMode: "advanced",
    departureDate: null,
    returnDate: null,
    dateRange: { start: "2026-09-01", end: "2026-09-03" },
    tripDurationDays: 7,
  };

  const plan = planSearches(advanced);
  assert.equal(costOf(plan), 6);
  assert.deepEqual(
    planRequestBatches(plan).map((batch) => batch.departureId),
    ["ATH,HER,SKG", "ATH,HER,SKG", "ATH,HER,SKG", "ATH,BER", "ATH,BER", "ATH,BER"],
  );
});

check("one-way searches only spend the outbound batch", () => {
  const oneWay: SearchQuery = { ...QUERY, tripType: "one-way", returnDate: null };
  assert.equal(costOf(planSearches(oneWay)), 1);
});

function serpApiFixture(from: string, to: string, date: string, price: number) {
  return {
    best_flights: [
      {
        flights: [
          {
            departure_airport: { id: from, name: from, time: `${date} 09:00` },
            arrival_airport: { id: to, name: to, time: `${date} 11:00` },
            duration: 120,
            airline: "Fixture Air",
            airline_logo: "https://example.invalid/fixture.png",
            airplane: "Test 100",
            travel_class: "Economy",
            flight_number: "FX 100",
          },
        ],
        total_duration: 120,
        price,
        carbon_emissions: { this_flight: 100000, difference_percent: -5 },
      },
    ],
  };
}

check("SerpApi flight JSON is normalized into the live pool", () => {
  const normalized = normalizeSerpApiResponse(serpApiFixture("ATH", "BER", "2026-09-14", 90));
  assert.equal(normalized.length, 1);
  assert.equal(normalized[0].outbound.segments[0].departure.airport, "ATH");
  assert.equal(normalized[0].price, 90);

  const plan = planSearches(QUERY);
  const batches = planRequestBatches(plan);
  const outbound = batches.find((batch) => batch.direction === "outbound")!;
  const returning = batches.find((batch) => batch.direction === "return")!;
  const pool = livePoolFromResponses(plan, [
    { batch: outbound, data: serpApiFixture("ATH", "BER", "2026-09-14", 90) },
    { batch: returning, data: serpApiFixture("BER", "ATH", "2026-09-21", 70) },
  ]);

  assert.equal(pool[poolKey("ATH", "BER", "2026-09-14")].length, 1);
  assert.equal(pool[poolKey("ATH", "BER", "2026-09-14")][0].price, 90);
  assert.equal(pool[poolKey("BER", "ATH", "2026-09-21")][0].price, 70);
});

check("raw flight records are kept per route, and the pool rebuilds from them", () => {
  const plan = planSearches(QUERY);
  const batches = planRequestBatches(plan);
  const outbound = batches.find((batch) => batch.direction === "outbound")!;
  const returning = batches.find((batch) => batch.direction === "return")!;
  const responses = [
    { batch: outbound, data: serpApiFixture("ATH", "BER", "2026-09-14", 90) },
    { batch: returning, data: serpApiFixture("BER", "ATH", "2026-09-21", 70) },
  ];

  const records = flightRecordsFromResponses(plan, responses);

  // One record per planned search — the raw data is never merged or dropped.
  assert.equal(records.length, plan.length);
  for (const record of records) {
    assert.equal(record.id, `${record.from}-${record.to}-${record.date}-${record.direction}`);
  }

  // A flight is attributed to its own route, not to every route in the batch.
  const outboundRecord = records.find(
    (r) => r.from === "ATH" && r.to === "BER" && r.direction === "outbound",
  )!;
  assert.equal(outboundRecord.flights.length, 1);
  assert.equal(outboundRecord.flights[0].price, 90);
  assert.equal(outboundRecord.reason, "main");

  const feeder = records.find((r) => r.from === "SKG" && r.to === "ATH")!;
  assert.equal(feeder.flights.length, 0, "SKG had no flights in this fixture");

  // Storing records loses nothing: the pool is identical either way.
  assert.deepEqual(poolFromRecords(records), livePoolFromResponses(plan, responses));
});

check("planSearches drops the feeder searches when nobody may gather", () => {
  const plan = planSearches(QUERY, { direct: true, gather: false });
  assert.equal(plan.filter((s) => s.reason === "feeder").length, 0);
});

check("an excluded date is never searched", () => {
  const advanced: SearchQuery = {
    ...QUERY,
    dateMode: "advanced",
    departureDate: null,
    returnDate: null,
    dateRange: { start: "2026-09-01", end: "2026-09-07" },
    tripDurationDays: 7,
    excludedDates: ["2026-09-03", "2026-09-04"],
  };
  const dates = candidateDates(advanced);
  assert.equal(dates.length, 5);
  assert.ok(!dates.includes("2026-09-03"));

  const plan = planSearches(advanced);
  assert.ok(!plan.some((s) => s.date === "2026-09-03"));
});

/* ── Search key ──────────────────────────────────────────────────────────── */

check("searchKeyOf is independent of field order", () => {
  const reordered: SearchQuery = {
    ...QUERY,
    origins: [...QUERY.origins].reverse(),
    destination: { ...QUERY.destination, airports: ["BER"] },
  };
  assert.equal(searchKeyOf(QUERY), searchKeyOf(reordered));
});

check("searchKeyOf changes when a passenger count changes", () => {
  const changed: SearchQuery = {
    ...QUERY,
    origins: [{ airport: "ATH", passengers: 11 }, ORIGINS[1], ORIGINS[2]],
  };
  assert.notEqual(searchKeyOf(QUERY), searchKeyOf(changed));
});

/* ── Group assembly and scoring ─────────────────────────────────────────── */

const POOL = mockPool(planSearches(QUERY));

check("mock data is deterministic for the same route and date", () => {
  const a = mockFlightsFor("ATH", "BER", "2026-09-14");
  const b = mockFlightsFor("ATH", "BER", "2026-09-14");
  assert.deepEqual(a, b);
  assert.ok(a.length >= 8);
});

check("buildArrangements produces one arrangement per viable routing", () => {
  const arrangements = buildArrangements({
    origins: ORIGINS,
    gatheringAirport: "ATH",
    destination: { cityId: "de-berlin", airport: "BER" },
    pool: POOL,
    departureDate: "2026-09-14",
    returnDate: "2026-09-21",
    allow: { direct: true, gather: true },
  });
  assert.ok(arrangements.length > 0, "expected at least one arrangement");
  assert.ok(arrangements.length <= 16);

  for (const arrangement of arrangements) {
    assert.equal(arrangement.legs.length, 3);
    assert.ok(arrangement.legs.every((leg) => leg.return !== null), "a round trip always returns");
    assert.equal(arrangement.totals.passengers, 20);
    assert.ok(arrangement.totals.totalPrice > 0);
  }
});

check("a gather leg is rejected when the feeder does not connect in time", () => {
  // A feeder landing one minute inside the buffer must not produce a leg.
  const tightPool: FlightPool = { ...POOL };
  const mainList = tightPool[poolKey("ATH", "BER", "2026-09-14")];
  const mainDeparture = mainList[0].outbound.segments[0].departure.time!;
  const [datePart, clockPart] = mainDeparture.split(" ");
  const [h, m] = clockPart.split(":").map(Number);
  const landMinutes = h * 60 + m - (MIN_GATHER_BUFFER_MINUTES - 1);
  const landing = `${datePart} ${String(Math.floor(landMinutes / 60)).padStart(2, "0")}:${String(
    landMinutes % 60,
  ).padStart(2, "0")}`;

  const feeder = mockFlightsFor("SKG", "ATH", "2026-09-14")[0];
  const tightFeeder = structuredClone(feeder);
  const last = tightFeeder.outbound.segments[tightFeeder.outbound.segments.length - 1];
  last.arrival.time = landing;

  tightPool[poolKey("SKG", "ATH", "2026-09-14")] = [tightFeeder];

  const arrangements = buildArrangements({
    origins: [ORIGINS[0], ORIGINS[1]],
    gatheringAirport: "ATH",
    destination: { cityId: "de-berlin", airport: "BER" },
    pool: tightPool,
    departureDate: "2026-09-14",
    returnDate: null,
    allow: { direct: false, gather: true },
  });
  assert.equal(arrangements.length, 0, "a non-connecting feeder must yield nothing");
});

check("scoreArrangements weights hours by passenger count", () => {
  const base = buildArrangements({
    origins: ORIGINS,
    gatheringAirport: "ATH",
    destination: { cityId: "de-berlin", airport: "BER" },
    pool: POOL,
    departureDate: "2026-09-14",
    returnDate: "2026-09-21",
    allow: { direct: true, gather: true },
  });

  const scored = scoreArrangements(
    base,
    { price: 0, hour: 100 },
    DEFAULT_RANKING_CONFIG,
  );
  for (const arrangement of scored) {
    assert.ok(arrangement.score >= 0 && arrangement.score <= 1);
    assert.notEqual(arrangement.indices.hour, null);
  }
});

check("a priority date lifts a score without overriding a much better one", () => {
  const base = buildArrangements({
    origins: ORIGINS,
    gatheringAirport: "ATH",
    destination: { cityId: "de-berlin", airport: "BER" },
    pool: POOL,
    departureDate: "2026-09-14",
    returnDate: "2026-09-21",
    allow: { direct: true, gather: true },
  });

  const plain = scoreArrangements(base, { price: 60, hour: 40 }, DEFAULT_RANKING_CONFIG);
  const boosted = scoreArrangements(base, { price: 60, hour: 40 }, DEFAULT_RANKING_CONFIG, {
    "2026-09-14": 3,
  });

  for (let i = 0; i < plain.length; i++) {
    const lift = boosted[i].score - plain[i].score;
    assert.ok(lift > 0, "priority must lift the score");
    assert.ok(lift <= 0.061, "priority must stay a tie-break, not an override");
  }
});


/* ── Per-direction routing (the London case) ────────────────────────────── */

/** One single-segment flight with exact clock times, for hand-built pools. */
function flight(from: string, to: string, departs: string, lands: string, price: number): NormalizedFlight {
  return normalizeSerpApiResponse({
    best_flights: [
      {
        flights: [
          {
            departure_airport: { id: from, name: from, time: departs },
            arrival_airport: { id: to, name: to, time: lands },
            airline: "Fixture Air",
            flight_number: `FX ${from}${to}`,
          },
        ],
        price,
      },
    ],
  })[0];
}

const OUT = "2026-09-27";
const BACK = "2026-10-04";
const PAIR = [
  { airport: "ATH", passengers: 2 },
  { airport: "SKG", passengers: 2 },
];

/** ATH gathers; SKG can fly to London direct, but there is no STN -> SKG. */
function londonPool(): FlightPool {
  return {
    [poolKey("ATH", "STN", OUT)]: [flight("ATH", "STN", `${OUT} 10:00`, `${OUT} 12:00`, 100)],
    [poolKey("SKG", "STN", OUT)]: [flight("SKG", "STN", `${OUT} 09:00`, `${OUT} 12:00`, 80)],
    [poolKey("SKG", "ATH", OUT)]: [flight("SKG", "ATH", `${OUT} 06:00`, `${OUT} 07:00`, 30)],
    [poolKey("STN", "ATH", BACK)]: [flight("STN", "ATH", `${BACK} 13:00`, `${BACK} 17:00`, 90)],
    [poolKey("ATH", "SKG", BACK)]: [flight("ATH", "SKG", `${BACK} 19:00`, `${BACK} 20:00`, 40)],
  };
}

function londonArrangements(pool: FlightPool, returnDate: string | null = BACK) {
  return buildArrangements({
    origins: PAIR,
    gatheringAirport: "ATH",
    destination: { cityId: "uk-london", airport: "STN" },
    pool,
    departureDate: OUT,
    returnDate,
    allow: { direct: true, gather: true },
  });
}

check("a group with no direct way back returns via the gathering airport", () => {
  const arrangements = londonArrangements(londonPool());
  assert.ok(arrangements.length > 0);
  for (const arrangement of arrangements) {
    const skg = arrangement.legs.find((leg) => leg.origin === "SKG")!;
    assert.equal(skg.return?.routing, "gather");
    assert.equal(skg.return?.feeder?.outbound.segments[0].departure.airport, "ATH");
  }
});

check("going direct and coming back via the hub is priced from its own flights", () => {
  const mixed = londonArrangements(londonPool()).find(
    (a) => a.legs.find((leg) => leg.origin === "SKG")!.outbound.routing === "direct",
  )!;
  assert.ok(mixed, "direct out, via ATH back must be offered");
  // ATH: 2 x (100 + 90). SKG: 2 x (80 out + 90 STN->ATH + 40 ATH->SKG).
  assert.equal(mixed.totals.totalPrice, 2 * 190 + 2 * 210);
});

check("a round trip with no way back for one group yields nothing", () => {
  const pool = londonPool();
  delete pool[poolKey("ATH", "SKG", BACK)];
  assert.equal(londonArrangements(pool).length, 0);
  assert.ok(londonArrangements(pool, null).length > 0, "one-way still works without returns");
});

check("a return feeder leaving before the main flight lands is rejected", () => {
  const pool = londonPool();
  // Lands in ATH at 17:00; leaving for SKG at 18:00 is inside the 90 minute buffer.
  pool[poolKey("ATH", "SKG", BACK)] = [
    flight("ATH", "SKG", `${BACK} 18:00`, `${BACK} 19:00`, 40),
  ];
  assert.equal(londonArrangements(pool).length, 0);
});

check("each return is matched to flights from its own return date", () => {
  const records = [
    { from: "ATH", to: "STN", date: OUT, direction: "outbound" as const, price: 100 },
    { from: "STN", to: "ATH", date: BACK, direction: "return" as const, price: 90 },
    { from: "STN", to: "ATH", date: "2026-10-05", direction: "return" as const, price: 5 },
  ].map((r) => ({
    id: `${r.from}-${r.to}-${r.date}-${r.direction}`,
    from: r.from,
    to: r.to,
    date: r.date,
    direction: r.direction,
    reason: "main" as const,
    flights: [flight(r.from, r.to, `${r.date} 10:00`, `${r.date} 12:00`, r.price)],
  }));

  const arrangements = buildArrangements({
    origins: [{ airport: "ATH", passengers: 1 }],
    gatheringAirport: "ATH",
    destination: { cityId: "uk-london", airport: "STN" },
    pool: poolFromRecords(records),
    departureDate: OUT,
    returnDate: BACK,
    allow: { direct: true, gather: true },
  });
  assert.equal(arrangements.length, 1);
  assert.equal(arrangements[0].totals.totalPrice, 190);
});

/* ── Map selection ───────────────────────────────────────────────────────── */

check("selecting a city selects all of its airports", () => {
  const london = EUROPE_CITIES_BY_ID["uk-london"];
  const selection = selectCity(london);
  assert.equal(selection.airports.length, 4);
});

check("multi-select is confined to one city", () => {
  const lhr = airportByCode("LHR")!;
  const lgw = airportByCode("LGW")!;
  const cdg = airportByCode("CDG")!;

  let selection = toggleAirport({ cityId: null, airports: [] }, lhr);
  selection = toggleAirport(selection, lgw);
  assert.deepEqual(selection, { cityId: "uk-london", airports: ["LHR", "LGW"] });

  selection = toggleAirport(selection, cdg);
  assert.deepEqual(
    selection,
    { cityId: "fr-paris", airports: ["CDG"] },
    "picking another city must clear the previous city's airports",
  );
});

check("deselecting the last airport clears the selection", () => {
  const lhr = airportByCode("LHR")!;
  const selection = toggleAirport({ cityId: "uk-london", airports: ["LHR"] }, lhr);
  assert.deepEqual(selection, { cityId: null, airports: [] });
});

/* ── Storage degrades safely without a browser ──────────────────────────── */

check("storage returns defaults when localStorage is unavailable", () => {
  assert.deepEqual(loadSearches(), []);
  assert.equal(loadFilters().type, "round-trip");
  assert.equal(loadPreferences().sidebarCollapsed, false);
});

check("a search saved in the old leg shape still loads, flights unchanged", () => {
  const out = flight("SKG", "ATH", `${OUT} 06:00`, `${OUT} 07:00`, 30);
  const back = flight("ATH", "SKG", `${BACK} 19:00`, `${BACK} 20:00`, 40);
  const mainOut = flight("ATH", "STN", `${OUT} 10:00`, `${OUT} 12:00`, 100);
  const mainBack = flight("STN", "ATH", `${BACK} 13:00`, `${BACK} 17:00`, 90);
  const legacy = [
    {
      id: "old",
      savedAt: "2026-09-13T10:00:00.000Z",
      label: "London",
      key: "k",
      query: QUERY,
      arrangements: [
        {
          legs: [
            {
              origin: "SKG",
              routing: "gather",
              feeder: { outbound: out, return: back },
              main: { outbound: mainOut, return: mainBack },
              passengers: 2,
            },
          ],
        },
      ],
    },
  ];

  const store = new Map([["airsearcher:searches:v1", JSON.stringify(legacy)]]);
  const g = globalThis as { window?: unknown };
  g.window = { localStorage: { getItem: (k: string) => store.get(k) ?? null } };
  try {
    const [entry] = loadSearches();
    assert.ok(entry, "the old entry must not be dropped");
    const leg = entry.arrangements[0].legs[0];
    assert.equal(leg.outbound.routing, "gather");
    assert.equal(leg.outbound.feeder?.id, out.id);
    assert.equal(leg.outbound.main.id, mainOut.id);
    assert.equal(leg.return?.main.id, mainBack.id);
    assert.equal(leg.return?.feeder?.id, back.id);
  } finally {
    delete g.window;
  }
});

console.log(`\n${passed} checks passed.`);
