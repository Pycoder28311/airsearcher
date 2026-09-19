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
  ARRANGEMENTS_PER_ROUTING,
  poolKey,
  scoreArrangements,
  uniqueArrangements,
  type FlightPool,
} from "@/lib/airsearcher/grouping";
import {
  planRequestBatches,
  planSearches,
  candidateDates,
  returnDatesFor,
} from "@/lib/airsearcher/queryPlan";
import { eachDayInRange } from "@/lib/airsearcher/time";
import { costOf, explainCost } from "@/lib/airsearcher/quota";
import {
  flightRecordsFromResponses,
  livePoolFromResponses,
  normalizeSerpApiResponse,
  poolFromRecords,
} from "@/lib/airsearcher/serpApi";
import { googleFlightsUrl } from "@/lib/airsearcher/links";
import { applyScopedFilters } from "@/lib/airsearcher/filtering";
import { DEFAULT_FILTERS } from "@/lib/airsearcher/config/filters";
import { searchKeyOf } from "@/lib/airsearcher/searchKey";
import { buildSearchResult, usesSerpApi } from "@/lib/airsearcher/search";
import { buildPriceGrid, pairKey } from "@/lib/airsearcher/priceGrid";
import { normalizeTravelpayoutsResponse } from "@/lib/airsearcher/travelpayouts";
import { loadSearches, loadFilters, loadPreferences } from "@/lib/airsearcher/storage";
import { toggleAirport, selectCity } from "@/lib/airsearcher/mapSelection";
import { mockFlightsFor, mockPool } from "@/lib/airsearcher/mockFlights";
import { DEFAULT_RANKING_CONFIG } from "@/lib/airsearcher/config/ranking";
import { MIN_GATHER_BUFFER_MINUTES } from "@/lib/airsearcher/config/constants";
import { EUROPE_CITIES_BY_ID } from "@/data/europeCities";
import { airportByCode } from "@/data/places";
import {
  stopAirportsOf,
  type Arrangement,
  type NormalizedFlight,
  type SearchQuery,
} from "@/lib/airsearcher/types";

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

check("enumerateRoutings uses one routing for both directions on a round trip", () => {
  const routings = enumerateRoutings(ORIGINS, "ATH", { direct: true, gather: true }, true);
  assert.equal(routings.length, 4);
  for (const routing of routings) {
    assert.equal(routing.SKG.return, routing.SKG.outbound);
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

const FLEXIBLE: SearchQuery = {
  ...QUERY,
  dateMode: "advanced",
  departureDate: null,
  returnDate: null,
  dateRange: { start: "2026-09-01", end: "2026-09-10" },
  tripDurationDays: 7,
  tripLengthRange: { min: 3, max: 7 },
};

check("an open trip length keeps the whole trip inside the window", () => {
  // The last departure that can still come back 3 nights later by the 10th.
  assert.deepEqual(candidateDates(FLEXIBLE), eachDayInRange("2026-09-01", "2026-09-07"));
  assert.deepEqual(returnDatesFor(FLEXIBLE, "2026-09-01"), eachDayInRange("2026-09-04", "2026-09-08"));
  assert.deepEqual(returnDatesFor(FLEXIBLE, "2026-09-06"), ["2026-09-09", "2026-09-10"]);
  for (const search of planSearches(FLEXIBLE)) {
    assert.ok(search.date >= "2026-09-01" && search.date <= "2026-09-10");
  }
});

check("an open trip length costs at most one request per day each way", () => {
  const plan = planSearches(FLEXIBLE);
  // 7 departure days + 7 return days (4th..10th), never more than the window.
  assert.equal(costOf(plan), 14);
  const fixed = planSearches({ ...FLEXIBLE, tripLengthRange: null });
  assert.ok(costOf(plan) <= costOf(fixed));
});

check("an open trip length skips excluded return dates and changes the key", () => {
  const excluded = { ...FLEXIBLE, excludedDates: ["2026-09-05"] };
  assert.ok(!returnDatesFor(excluded, "2026-09-01").includes("2026-09-05"));
  assert.notEqual(searchKeyOf(FLEXIBLE), searchKeyOf({ ...FLEXIBLE, tripLengthRange: null }));
});

/* ── Price grid — built from arrangements the search already holds ────────── */

const GRID_QUERY: SearchQuery = {
  ...FLEXIBLE,
  dateRange: { start: "2026-09-01", end: "2026-09-10" },
  tripLengthRange: { min: 2, max: 4 },
};

/** Just enough of an arrangement for the grid: its dates and its price. */
function priced(departureDate: string, returnDate: string, totalPrice: number): Arrangement {
  return { departureDate, returnDate, totals: { totalPrice } } as unknown as Arrangement;
}

check("the price grid has a row per candidate date and only 2-4 night cells", () => {
  const grid = buildPriceGrid(GRID_QUERY, []);
  assert.deepEqual(grid.departureDates, candidateDates(GRID_QUERY));
  const union = new Set(grid.departureDates.flatMap((d) => returnDatesFor(GRID_QUERY, d)));
  assert.deepEqual(grid.returnDates, [...union].sort());
  for (const cell of grid.cells.values()) assert.ok(cell.nights >= 2 && cell.nights <= 4);
  // A 1-night and a 5-night pair are not trips at all.
  assert.ok(!grid.cells.has(pairKey("2026-09-01", "2026-09-02")));
  assert.ok(!grid.cells.has(pairKey("2026-09-01", "2026-09-06")));
});

check("a grid cell holds the cheapest price, and an empty pair stays a cell", () => {
  const grid = buildPriceGrid(GRID_QUERY, [
    priced("2026-09-01", "2026-09-04", 900),
    priced("2026-09-01", "2026-09-04", 700),
    priced("2026-09-01", "2026-09-04", 800),
    priced("2026-09-02", "2026-09-05", 1200),
    priced("2026-09-03", "2026-09-05", 1000),
  ]);
  const cell = grid.cells.get(pairKey("2026-09-01", "2026-09-04"));
  assert.equal(cell?.cheapest, 700);
  assert.equal(cell?.count, 3);
  const empty = grid.cells.get(pairKey("2026-09-01", "2026-09-03"));
  assert.ok(empty, "a valid pair with no result is still present");
  assert.equal(empty.cheapest, null);
  assert.equal(grid.best?.cheapest, 700);
  assert.ok(grid.thresholds && grid.thresholds.low <= grid.thresholds.high);
});

check("a fixed-length or exact search has no price grid", () => {
  assert.equal(buildPriceGrid({ ...GRID_QUERY, tripLengthRange: null }, []).departureDates.length, 0);
  assert.equal(buildPriceGrid(QUERY, []).departureDates.length, 0);
});

check("every date pair keeps a price, within the arrangement cap", () => {
  const wide: SearchQuery = {
    ...FLEXIBLE,
    dateRange: { start: "2026-10-01", end: "2026-11-14" },
    tripLengthRange: { min: 3, max: 14 },
  };
  const pairs = candidateDates(wide).flatMap((d) => returnDatesFor(wide, d));
  assert.ok(pairs.length > 300, `expected more than 300 pairs, got ${pairs.length}`);

  const { arrangements, priceGrid } = buildSearchResult(
    wide,
    DEFAULT_RANKING_CONFIG,
    mockPool(planSearches(wide)),
  );
  assert.ok(arrangements.length <= 300, "the stored arrangements stay within the cap");
  assert.equal(Object.keys(priceGrid.cells).length, pairs.length, "the floor covers every pair");

  const grid = buildPriceGrid(wide, arrangements, { floor: priceGrid, stored: arrangements });
  const cells = [...grid.cells.values()];
  assert.ok(cells.every((cell) => cell.cheapest !== null), "no hole left by the cap");
  // The cheapest pairs are kept first, so the grid's best is a real, listable one.
  assert.equal(grid.best?.unfiltered, false);
  assert.equal(grid.best?.cheapest, Math.min(...Object.values(priceGrid.cells)));
  for (const cell of cells) {
    assert.equal(cell.cheapest, priceGrid.cells[pairKey(cell.departureDate, cell.returnDate)]);
  }
  // Every departure date still keeps its cheapest arrangement for the chart.
  const days = new Set(arrangements.map((a) => a.departureDate));
  assert.equal(days.size, candidateDates(wide).length);
});

check("a pair the filters emptied shows no result, not the stored floor", () => {
  const stored = [priced("2026-09-01", "2026-09-04", 700)];
  const floor = { cells: { [pairKey("2026-09-01", "2026-09-04")]: 700, [pairKey("2026-09-02", "2026-09-05")]: 650 } };
  const grid = buildPriceGrid(GRID_QUERY, [], { floor, stored });
  assert.equal(grid.cells.get(pairKey("2026-09-01", "2026-09-04"))?.cheapest, null);
  const capped = grid.cells.get(pairKey("2026-09-02", "2026-09-05"));
  assert.equal(capped?.cheapest, 650);
  assert.equal(capped?.unfiltered, true);
  assert.equal(grid.best, null, "a floor price is never the highlighted best");
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

check("buildArrangements keeps several options per viable routing, within the cap", () => {
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
  assert.ok(arrangements.length > 4, "more than the cheapest option per routing");
  assert.ok(arrangements.length <= 4 * ARRANGEMENTS_PER_ROUTING);

  for (const arrangement of arrangements) {
    assert.equal(arrangement.legs.length, 3);
    assert.ok(arrangement.legs.every((leg) => leg.return !== null), "every mock route has return flights");
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
  // The only hub flight, so no later one can rescue the connection.
  tightPool[poolKey("ATH", "BER", "2026-09-14")] = [mainList[0]];

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
function flight(
  from: string,
  to: string,
  departs: string,
  lands: string,
  price: number,
  airline = "Fixture Air",
): NormalizedFlight {
  return normalizeSerpApiResponse({
    best_flights: [
      {
        flights: [
          {
            departure_airport: { id: from, name: from, time: departs },
            arrival_airport: { id: to, name: to, time: lands },
            airline,
            flight_number: `${airline} ${from}${to}`,
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

check("a group with no return flights still appears, without a return", () => {
  const arrangements = londonArrangements(londonPool());
  const direct = arrangements.find(
    (a) => a.legs.find((leg) => leg.origin === "SKG")!.outbound.routing === "direct",
  )!;
  assert.ok(direct, "SKG direct is kept although there is no STN -> SKG");
  assert.equal(direct.legs.find((leg) => leg.origin === "SKG")!.return, null);

  const gather = arrangements.find(
    (a) => a.legs.find((leg) => leg.origin === "SKG")!.outbound.routing === "gather",
  )!;
  const skg = gather.legs.find((leg) => leg.origin === "SKG")!;
  assert.equal(skg.return?.routing, "gather", "via ATH out means via ATH back");
});

check("a group's price counts only the flights it has", () => {
  const arrangements = londonArrangements(londonPool());
  const bySkg = (routing: string) =>
    arrangements.find(
      (a) => a.legs.find((leg) => leg.origin === "SKG")!.outbound.routing === routing,
    )!;
  // ATH: 2 x (100 + 90). SKG direct: 2 x 80, no return flight.
  assert.equal(bySkg("direct").totals.totalPrice, 2 * 190 + 2 * 80);
  // SKG via ATH: 2 x (30 + 100 out, 90 + 40 back).
  assert.equal(bySkg("gather").totals.totalPrice, 2 * 190 + 2 * 260);
});

check("a missing return does not remove the arrangement", () => {
  const pool = londonPool();
  delete pool[poolKey("ATH", "SKG", BACK)];
  const arrangements = londonArrangements(pool);
  assert.equal(arrangements.length, 2);
});

check("return hops are not checked for connection", () => {
  const pool = londonPool();
  pool[poolKey("ATH", "SKG", BACK)] = [
    flight("ATH", "SKG", `${BACK} 18:00`, `${BACK} 19:00`, 40),
  ];
  assert.equal(londonArrangements(pool).length, 2);
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
  assert.deepEqual(selection.airports, london.airportCodes);
  assert.ok(selection.airports.includes("LHR") && selection.airports.includes("LGW"));
});

check("a rural place keeps airports that belong to other cities", () => {
  // Any UNESCO site or park listing an airport that belongs to a nearby city.
  const place = Object.values(EUROPE_CITIES_BY_ID).find(
    (city) =>
      (city.kind === "unesco" || city.kind === "park") &&
      city.airportCodes.length > 1 &&
      city.airportCodes.some((code) => airportByCode(code)?.cityId !== city.id),
  );
  if (!place) return; // Only before the destination list has been generated.

  const [first, second] = place.airportCodes.map((code) => airportByCode(code)!);
  let selection = selectCity(place);
  selection = toggleAirport(selection, first);
  assert.equal(selection.cityId, place.id, "unticking a nearby airport must not leave the place");
  assert.ok(!selection.airports.includes(first.code));
  selection = toggleAirport(selection, first);
  assert.equal(selection.cityId, place.id);
  assert.ok(selection.airports.includes(first.code) && selection.airports.includes(second.code));
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

check("Travelpayouts options normalize with arrival in the destination's local time", () => {
  const flights = normalizeTravelpayoutsResponse(
    {
      success: true,
      data: [
        {
          origin: "LON",
          destination: "ATH",
          origin_airport: "STN",
          destination_airport: "ATH",
          price: 54,
          airline: "FR",
          flight_number: "1234",
          departure_at: "2026-10-04T13:00:00+01:00",
          transfers: 0,
          duration_to: 240,
        },
        // Another London airport is not this route.
        {
          origin_airport: "LTN",
          destination_airport: "ATH",
          price: 20,
          departure_at: "2026-10-04T08:00:00+01:00",
          duration_to: 230,
        },
      ],
    },
    "STN",
    "ATH",
  );

  assert.equal(flights.length, 1);
  const [f] = flights;
  assert.equal(f.price, 54);
  assert.equal(f.airline.name, "FR");
  assert.equal(f.outbound.segments[0].departure.time, "2026-10-04 13:00");
  // 13:00 in London (UTC+1) plus 4 hours lands at 19:00 in Athens (UTC+3).
  assert.equal(f.outbound.segments[0].arrival.time, "2026-10-04 19:00");
  assert.equal(f.outbound.stops, 0);
});

check("same airline keeps only arrangements flown entirely by one airline", () => {
  const pool: FlightPool = {
    [poolKey("ATH", "STN", OUT)]: [
      flight("ATH", "STN", `${OUT} 10:00`, `${OUT} 12:00`, 100, "Aegean"),
      flight("ATH", "STN", `${OUT} 11:00`, `${OUT} 13:00`, 60, "Ryanair"),
    ],
    [poolKey("SKG", "STN", OUT)]: [flight("SKG", "STN", `${OUT} 09:00`, `${OUT} 12:00`, 80, "Ryanair")],
    [poolKey("SKG", "ATH", OUT)]: [flight("SKG", "ATH", `${OUT} 06:00`, `${OUT} 07:00`, 30, "Aegean")],
    [poolKey("STN", "ATH", BACK)]: [flight("STN", "ATH", `${BACK} 13:00`, `${BACK} 17:00`, 90, "Aegean")],
    [poolKey("ATH", "SKG", BACK)]: [
      flight("ATH", "SKG", `${BACK} 19:00`, `${BACK} 20:00`, 40, "Aegean"),
      flight("ATH", "SKG", `${BACK} 19:30`, `${BACK} 20:30`, 10, "Ryanair"),
    ],
  };
  const args = {
    origins: PAIR,
    gatheringAirport: "ATH",
    destination: { cityId: "uk-london", airport: "STN" },
    pool,
    departureDate: OUT,
    returnDate: BACK,
    allow: { direct: true, gather: true },
  };

  const mixed = buildArrangements(args);
  assert.ok(mixed.some((a) => a.totals.airlines.length > 1), "without the option airlines mix");

  const same = buildArrangements({ ...args, sameAirline: true });
  assert.ok(same.length > 0);
  for (const arrangement of same) {
    assert.equal(arrangement.totals.airlines.length, 1);
  }
  assert.equal(new Set(same.map((a) => a.id)).size, same.length, "ids stay unique");
});

check("the same-airline option changes the search key only when it is on", () => {
  assert.equal(searchKeyOf({ ...QUERY, sameAirline: false }), searchKeyOf(QUERY));
  assert.notEqual(searchKeyOf({ ...QUERY, sameAirline: true }), searchKeyOf(QUERY));
});

check("a feeder that misses the cheapest hub flight still catches a later one", () => {
  const day = "2026-10-01";
  const arrangements = buildArrangements({
    origins: [{ airport: "HER", passengers: 1 }],
    gatheringAirport: "ATH",
    destination: { cityId: "ro-bucharest", airport: "OTP" },
    pool: {
      [poolKey("HER", "OTP", day)]: [flight("HER", "OTP", `${day} 12:00`, `${day} 14:00`, 200)],
      [poolKey("HER", "ATH", day)]: [flight("HER", "ATH", `${day} 09:00`, `${day} 10:00`, 40)],
      [poolKey("ATH", "OTP", day)]: [
        // Cheapest, but leaves 30 minutes after the feeder lands.
        flight("ATH", "OTP", `${day} 10:30`, `${day} 12:00`, 50),
        flight("ATH", "OTP", `${day} 15:00`, `${day} 16:30`, 70),
      ],
    },
    departureDate: day,
    returnDate: null,
    allow: { direct: true, gather: true },
  });

  const viaAth = arrangements.filter((a) => a.legs[0].outbound.routing === "gather");
  assert.equal(viaAth.length, 1, "HER -> ATH -> OTP must be offered");
  assert.equal(viaAth[0].legs[0].outbound.main.price, 70);
  assert.equal(viaAth[0].totals.totalPrice, 110);
  assert.ok(arrangements.some((a) => a.legs[0].outbound.routing === "direct"));
});

check("the same flight listed twice by the provider is kept once", () => {
  const option = serpApiFixture("ATH", "BER", "2026-09-14", 90).best_flights[0];
  const plan = planSearches(QUERY);
  const outbound = planRequestBatches(plan).find((batch) => batch.direction === "outbound")!;
  const records = flightRecordsFromResponses(plan, [
    // Google can list one option in both sections, at a higher price in one.
    { batch: outbound, data: { best_flights: [option], other_flights: [{ ...option, price: 120 }] } },
  ]);
  const route = records.find((r) => r.from === "ATH" && r.to === "BER")!;
  assert.equal(route.flights.length, 1);
  assert.equal(route.flights[0].price, 90);
});

check("one ticket with a stop and the same flights as two tickets show once", () => {
  const day = "2026-10-01";
  const feeder = flight("HER", "ATH", `${day} 09:00`, `${day} 10:00`, 40);
  const main = flight("ATH", "OTP", `${day} 12:00`, `${day} 13:30`, 70);
  // The same two flights sold as one ticket, a little cheaper.
  const oneTicket: NormalizedFlight = {
    ...structuredClone(feeder),
    id: "one-ticket",
    price: 100,
    outbound: {
      segments: [feeder.outbound.segments[0], main.outbound.segments[0]],
      layovers: [],
      stops: 1,
      totalDurationMinutes: 270,
    },
  };

  const arrangements = buildArrangements({
    origins: [{ airport: "HER", passengers: 1 }],
    gatheringAirport: "ATH",
    destination: { cityId: "ro-bucharest", airport: "OTP" },
    pool: {
      [poolKey("HER", "OTP", day)]: [oneTicket, structuredClone(oneTicket)],
      [poolKey("HER", "ATH", day)]: [feeder],
      [poolKey("ATH", "OTP", day)]: [main],
    },
    departureDate: day,
    returnDate: null,
    allow: { direct: true, gather: true },
  });

  assert.equal(arrangements.length, 1);
  assert.equal(arrangements[0].totals.totalPrice, 100);
  assert.equal(arrangements[0].legs[0].outbound.routing, "direct");
});

check("stop airports come from layovers, else from segment boundaries", () => {
  const day = "2026-10-01";
  const first = flight("HER", "ATH", `${day} 09:00`, `${day} 10:00`, 40);
  const second = flight("ATH", "OTP", `${day} 12:00`, `${day} 13:30`, 70);
  const withoutLayovers: NormalizedFlight = {
    ...first,
    outbound: {
      segments: [first.outbound.segments[0], second.outbound.segments[0]],
      layovers: [],
      stops: 1,
      totalDurationMinutes: 270,
    },
  };
  assert.deepEqual(stopAirportsOf(withoutLayovers), ["ATH"]);
  assert.deepEqual(stopAirportsOf(first), []);
});

check("date ranges use SerpApi only when asked, and the choice is part of the key", () => {
  const range: SearchQuery = {
    ...QUERY,
    dateMode: "advanced",
    departureDate: null,
    returnDate: null,
    dateRange: { start: "2026-09-01", end: "2026-09-03" },
    tripDurationDays: 7,
  };
  assert.equal(usesSerpApi(QUERY), true);
  assert.equal(usesSerpApi(range), false);
  assert.equal(usesSerpApi({ ...range, rangeWithSerpApi: true }), true);
  assert.notEqual(searchKeyOf({ ...range, rangeWithSerpApi: true }), searchKeyOf(range));
  // Irrelevant for exact dates, so it must not split their saved results.
  assert.equal(searchKeyOf({ ...QUERY, rangeWithSerpApi: true }), searchKeyOf(QUERY));
});

check("a Google Flights link is built from the flight's route and day", () => {
  const url = new URL(googleFlightsUrl(flight("HER", "ATH", "2026-10-01 09:00", "2026-10-01 10:00", 40))!);
  assert.equal(url.origin + url.pathname, "https://www.google.com/travel/flights");
  assert.equal(url.searchParams.get("q"), "Flights from HER to ATH on 2026-10-01 one way");
});

check("the airline filter keeps only results flown entirely by one chosen airline", () => {
  const day = "2026-10-01";
  const pool: FlightPool = {
    [poolKey("HER", "OTP", day)]: [flight("HER", "OTP", `${day} 12:00`, `${day} 14:00`, 200, "Aegean")],
    [poolKey("HER", "ATH", day)]: [flight("HER", "ATH", `${day} 09:00`, `${day} 10:00`, 40, "Sky Express")],
    [poolKey("ATH", "OTP", day)]: [flight("ATH", "OTP", `${day} 15:00`, `${day} 16:30`, 70, "Aegean")],
  };
  const arrangements = buildArrangements({
    origins: [{ airport: "HER", passengers: 1 }],
    gatheringAirport: "ATH",
    destination: { cityId: "ro-bucharest", airport: "OTP" },
    pool,
    departureDate: day,
    returnDate: null,
    allow: { direct: true, gather: true },
  });
  assert.equal(arrangements.length, 2);

  const onlyAegean = { ...DEFAULT_FILTERS, airlineMode: "include" as const, airlines: ["Aegean"] };
  const kept = applyScopedFilters(arrangements, onlyAegean);
  assert.equal(kept.length, 1, "the via-ATH result also uses Sky Express");
  assert.equal(kept[0].legs[0].outbound.routing, "direct");

  // Either airline alone qualifies; the via-ATH result mixes the two, so it does not.
  const both = { ...onlyAegean, airlines: ["Aegean", "Sky Express"] };
  const eitherOne = applyScopedFilters(arrangements, both);
  assert.equal(eitherOne.length, 1);
  assert.equal(eitherOne[0].legs[0].outbound.routing, "direct");

  const notSky = { ...DEFAULT_FILTERS, airlineMode: "exclude" as const, airlines: ["Sky Express"] };
  assert.equal(applyScopedFilters(arrangements, notSky).length, 1);
});

check("the results pipeline never lists the same arrangement twice", () => {
  const base = buildArrangements({
    origins: ORIGINS,
    gatheringAirport: "ATH",
    destination: { cityId: "de-berlin", airport: "BER" },
    pool: POOL,
    departureDate: "2026-09-14",
    returnDate: "2026-09-21",
    allow: { direct: true, gather: true },
  });
  // A saved search from before de-duplication can hold copies under new ids.
  const saved = [...base, ...base.map((a) => ({ ...a, id: `${a.id}:copy` }))];
  const shown = applyScopedFilters(uniqueArrangements(saved), DEFAULT_FILTERS);
  assert.equal(shown.length, base.length);
  assert.equal(new Set(shown.map((a) => a.id)).size, shown.length);
});

console.log(`\n${passed} checks passed.`);
