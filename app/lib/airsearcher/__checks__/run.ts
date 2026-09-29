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
  everyoneGetsHome,
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
import { eachDayInRange, extendRange } from "@/lib/airsearcher/time";
import { costOf, explainCost } from "@/lib/airsearcher/quota";
import {
  flightRecordsFromResponses,
  livePoolFromResponses,
  normalizeSerpApiResponse,
  poolFromRecords,
} from "@/lib/airsearcher/serpApi";
import { googleFlightsUrl } from "@/lib/airsearcher/links";
import {
  applyScopedFilters,
  connectingAirports,
  matchesLayover,
  matchesStops,
} from "@/lib/airsearcher/filtering";
import { journeyStopCount } from "@/lib/airsearcher/journeyStops";
import { DEFAULT_FILTERS } from "@/lib/airsearcher/config/filters";
import { searchKeyOf } from "@/lib/airsearcher/searchKey";
import { buildSearchResult, usesSerpApi } from "@/lib/airsearcher/search";
import { MAX_AIRPORTS_PER_REQUEST } from "@/lib/airsearcher/config/constants";
import { buildPriceGrid, pairKey } from "@/lib/airsearcher/priceGrid";
import { normalizeTravelpayoutsResponse } from "@/lib/airsearcher/travelpayouts";
import { loadSearches, loadFilters, loadPreferences } from "@/lib/airsearcher/storage";
import { resetStorageClientForChecks } from "@/lib/airsearcher/storageClient";
import { toggleAirport, selectCity } from "@/lib/airsearcher/mapSelection";
import { mockFlightsFor, mockPool } from "@/lib/airsearcher/mockFlights";
import { DEFAULT_RANKING_CONFIG } from "@/lib/airsearcher/config/ranking";
import { MIN_GATHER_BUFFER_MINUTES } from "@/lib/airsearcher/config/constants";
import { EUROPE_CITIES_BY_ID } from "@/data/europeCities";
import { airportByCode, searchPlaces } from "@/data/places";
import {
  destinationsOf,
  mergedDestinations,
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
  destinations: [{ cityId: "de-berlin", airports: ["BER"] }],
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
  return { departureDate, returnDate, legs: [], totals: { totalPrice } } as unknown as Arrangement;
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


/* ── Several destinations in one search ──────────────────────────────────── */

const TWO_CITIES: SearchQuery = {
  ...QUERY,
  destinations: [
    { cityId: "de-berlin", airports: ["BER"] },
    { cityId: "fr-paris", airports: ["CDG", "ORY"] },
  ],
};

check("a second destination rides along in the same requests", () => {
  const plan = planSearches(TWO_CITIES);
  const routes = new Set(plan.map((search) => `${search.from}-${search.to}`));
  assert.ok(routes.has("ATH-BER") && routes.has("ATH-CDG") && routes.has("ATH-ORY"));
  // Still one outbound and one return request, as for a single destination.
  assert.equal(costOf(plan), costOf(planSearches(QUERY)));
  assert.deepEqual(planRequestBatches(plan), [
    {
      direction: "outbound",
      departureId: "ATH,HER,SKG",
      arrivalId: "ATH,BER,CDG,ORY",
      date: "2026-09-14",
    },
    {
      direction: "return",
      departureId: "ATH,BER,CDG,ORY",
      arrivalId: "ATH,HER,SKG",
      date: "2026-09-21",
    },
  ]);
});

check("too many airports for one request split it, covering every route once", () => {
  const crowded: SearchQuery = {
    ...QUERY,
    destinations: [
      { cityId: "uk-london", airports: ["LHR", "LGW", "STN", "LTN", "LCY", "SEN"] },
      { cityId: "fr-paris", airports: ["CDG", "ORY"] },
    ],
  };
  const plan = planSearches(crowded);
  const batches = planRequestBatches(plan);
  // 9 destination airports plus the hub need two arrival groups each way.
  assert.equal(costOf(plan), 4);
  for (const batch of batches) {
    assert.ok(batch.departureId.split(",").length <= MAX_AIRPORTS_PER_REQUEST);
    assert.ok(batch.arrivalId.split(",").length <= MAX_AIRPORTS_PER_REQUEST);
  }
  // Every planned leg belongs to exactly one batch, so nothing is lost or asked twice.
  for (const search of plan) {
    const covering = batches.filter(
      (batch) =>
        batch.direction === search.direction &&
        batch.date === search.date &&
        batch.departureId.split(",").includes(search.from) &&
        batch.arrivalId.split(",").includes(search.to),
    );
    assert.equal(covering.length, 1, `${search.from}->${search.to} covered ${covering.length} times`);
  }
});

check("several destinations cost no more across a date range with open nights", () => {
  const range: SearchQuery = {
    ...FLEXIBLE,
    destinations: TWO_CITIES.destinations,
  };
  assert.equal(costOf(planSearches(range)), costOf(planSearches(FLEXIBLE)));
  for (const search of planSearches(range)) {
    assert.ok(search.date >= "2026-09-01" && search.date <= "2026-09-10");
  }
});

check("arrangements are built for every destination, each keeping its own city", () => {
  const range: SearchQuery = { ...FLEXIBLE, destinations: TWO_CITIES.destinations };
  const built = buildSearchResult(range, DEFAULT_RANKING_CONFIG, mockPool(planSearches(range)));
  const cities = new Set(built.arrangements.map((a) => a.destination.cityId));
  assert.deepEqual([...cities].sort(), ["de-berlin", "fr-paris"]);
  for (const arrangement of built.arrangements) {
    const place = range.destinations.find((p) => p.cityId === arrangement.destination.cityId);
    assert.ok(place?.airports.includes(arrangement.destination.airport));
  }
});

check("the key ignores destination order and still matches an old single-city search", () => {
  const reordered: SearchQuery = {
    ...TWO_CITIES,
    destinations: [...TWO_CITIES.destinations].reverse(),
  };
  assert.equal(searchKeyOf(TWO_CITIES), searchKeyOf(reordered));
  assert.notEqual(searchKeyOf(TWO_CITIES), searchKeyOf(QUERY));
  // A search saved with the old single-destination field keeps its old key.
  const legacy = { ...QUERY, destinations: [], destination: QUERY.destinations[0] };
  assert.equal(searchKeyOf(legacy), searchKeyOf(QUERY));
  assert.deepEqual(destinationsOf(legacy), QUERY.destinations);
  assert.deepEqual(planSearches(legacy), planSearches(QUERY));
});

/* ── Search key ──────────────────────────────────────────────────────────── */

check("searchKeyOf is independent of field order", () => {
  const reordered: SearchQuery = {
    ...QUERY,
    origins: [...QUERY.origins].reverse(),
    destinations: [{ cityId: "de-berlin", airports: ["BER"] }],
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

check("a group with no way home rules the arrangement out", () => {
  // No STN -> SKG: SKG flying direct could not get back, so only via ATH is left.
  const arrangements = londonArrangements(londonPool());
  assert.ok(arrangements.length > 0);
  for (const arrangement of arrangements) {
    const skg = arrangement.legs.find((leg) => leg.origin === "SKG")!;
    assert.equal(skg.outbound.routing, "gather", "SKG direct has no way back");
    assert.equal(skg.return?.routing, "gather", "via ATH out means via ATH back");
    assert.ok(skg.return?.feeder, "and home to SKG from ATH");
    assert.ok(everyoneGetsHome(arrangement));
  }
});

check("a group's price counts its flights both ways", () => {
  const [arrangement] = londonArrangements(londonPool());
  // ATH: 2 x (100 + 90). SKG via ATH: 2 x (30 + 100 out, 90 + 40 back).
  assert.equal(arrangement.totals.totalPrice, 2 * 190 + 2 * 260);
});

check("landing at the hub with no flight home removes the arrangement", () => {
  const pool = londonPool();
  delete pool[poolKey("ATH", "SKG", BACK)];
  assert.equal(londonArrangements(pool).length, 0);
  // One way, nobody needs to get back.
  assert.ok(londonArrangements(pool, null).length > 0);
});

check("results saved without a way home are recognised", () => {
  const [arrangement] = londonArrangements(londonPool());
  const noReturn = {
    ...arrangement,
    legs: arrangement.legs.map((leg) => (leg.origin === "SKG" ? { ...leg, return: null } : leg)),
  };
  const noFeeder = {
    ...arrangement,
    legs: arrangement.legs.map((leg) =>
      leg.origin === "SKG" && leg.return ? { ...leg, return: { ...leg.return, feeder: null } } : leg,
    ),
  };
  assert.equal(everyoneGetsHome(noReturn), false);
  assert.equal(everyoneGetsHome(noFeeder), false);
  assert.equal(everyoneGetsHome({ ...noReturn, returnDate: null }), true);
});

check("a return feeder leaving too soon after the main flight lands is rejected", () => {
  const pool = londonPool();
  // STN -> ATH lands 17:00; an 18:00 feeder is inside the connection buffer.
  pool[poolKey("ATH", "SKG", BACK)] = [
    flight("ATH", "SKG", `${BACK} 18:00`, `${BACK} 19:00`, 40),
  ];
  // SKG direct has no way back either (no STN -> SKG), so SKG cannot get home.
  assert.equal(londonArrangements(pool).length, 0);

  // A later feeder that does connect brings the via-ATH plan back.
  pool[poolKey("ATH", "SKG", BACK)].push(flight("ATH", "SKG", `${BACK} 19:00`, `${BACK} 20:00`, 45));
  const again = londonArrangements(pool);
  const skg = again
    .map((a) => a.legs.find((leg) => leg.origin === "SKG")!)
    .find((leg) => leg.outbound.routing === "gather")!;
  assert.ok(skg, "the connecting feeder is used");
  assert.equal(skg.return?.feeder?.outbound.segments[0].departure.time, `${BACK} 19:00`);
});

/** One Google-style ticket with its own stop: SKG -> ATH -> STN, one price. */
function oneStopTicket(price: number): NormalizedFlight {
  return normalizeSerpApiResponse({
    best_flights: [
      {
        flights: [
          {
            departure_airport: { id: "SKG", name: "SKG", time: `${OUT} 06:00` },
            arrival_airport: { id: "ATH", name: "ATH", time: `${OUT} 07:00` },
            airline: "Fixture Air",
            flight_number: "FX 1",
          },
          {
            departure_airport: { id: "ATH", name: "ATH", time: `${OUT} 10:00` },
            arrival_airport: { id: "STN", name: "STN", time: `${OUT} 12:00` },
            airline: "Fixture Air",
            flight_number: "FX 2",
          },
        ],
        layovers: [{ id: "ATH", name: "ATH", duration: 180 }],
        price,
      },
    ],
  })[0];
}

check("a stop inside a ticket and a stop between tickets count the same", () => {
  const combined = [
    flight("SKG", "ATH", `${OUT} 06:00`, `${OUT} 07:00`, 30),
    flight("ATH", "STN", `${OUT} 10:00`, `${OUT} 12:00`, 100),
  ];
  const ticket = [oneStopTicket(130)];

  for (const going of [combined, ticket]) {
    const set = { going, returning: [] };
    assert.equal(journeyStopCount(going), 1);
    assert.equal(matchesStops(set, ["non-stop"]), false, "non-stop rules both out");
    assert.equal(matchesStops(set, ["1"]), true);
    assert.deepEqual(connectingAirports(set), ["ATH"]);
    assert.equal(matchesLayover(set, [0, 120]), false, "the 3h wait is judged either way");
    assert.equal(matchesLayover(set, [0, 240]), true);
  }
});

check("results without stops rank well above cheaper ones with stops", () => {
  const pool = londonPool();
  // SKG direct is now far dearer than going via ATH.
  pool[poolKey("SKG", "STN", OUT)] = [flight("SKG", "STN", `${OUT} 09:00`, `${OUT} 12:00`, 500)];
  const scored = scoreArrangements(
    londonArrangements(pool, null),
    { price: 100, hour: 0 },
    DEFAULT_RANKING_CONFIG,
  );
  const byRouting = (routing: string) =>
    scored.find((a) => a.legs.find((leg) => leg.origin === "SKG")!.outbound.routing === routing)!;

  assert.equal(byRouting("direct").indices.stops, 1);
  assert.equal(byRouting("gather").indices.price, 1, "via ATH is the cheapest");
  assert.ok(
    byRouting("direct").score > byRouting("gather").score,
    "everyone non-stop outranks a cheaper result with a stop",
  );
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

check("storage returns defaults before the saved data is loaded", () => {
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

  resetStorageClientForChecks({ "airsearcher:searches:v1": JSON.stringify(legacy) });
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
    resetStorageClientForChecks(null);
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

check("a ticket's link opens its booking page, naming every flight in it", () => {
  const tfsText = (url: string) =>
    Buffer.from(new URL(url).searchParams.get("tfs")!.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("latin1");
  const numbered = (f: NormalizedFlight, numbers: string[]): NormalizedFlight => ({
    ...f,
    outbound: { ...f.outbound, segments: f.outbound.segments.map((s, i) => ({ ...s, flightNumber: numbers[i] })) },
  });

  // One flight: ATH -> LTN, Ryanair FR 7806.
  const single = numbered(flight("ATH", "LTN", "2026-10-15 20:45", "2026-10-15 22:40", 111), ["FR 7806"]);
  const url = googleFlightsUrl(single)!;
  assert.equal(new URL(url).pathname, "/travel/flights/booking");
  assert.match(tfsText(url), /ATH\x12\n2026-10-15\x1a\x03LTN\*\x02FR2\x047806/);

  // A ticket with its own stop: both flights, in order, in one link.
  const leg1 = flight("SKG", "ATH", "2026-10-15 06:00", "2026-10-15 07:00", 0).outbound.segments[0];
  const leg2 = flight("ATH", "LTN", "2026-10-15 20:45", "2026-10-15 22:40", 0).outbound.segments[0];
  const withStop = numbered(
    { ...single, outbound: { ...single.outbound, segments: [leg1, leg2], stops: 1 } },
    ["A3 123", "A3 760"],
  );
  const text = tfsText(googleFlightsUrl(withStop)!);
  assert.ok(text.indexOf("A32\x03123") < text.indexOf("A32\x03760"), "flights in flown order");
  assert.ok(text.includes("SKG") && text.includes("LTN"));

  // No usable flight number: the route on its day, as before.
  const unknown = numbered(single, ["Fixture Air"]);
  assert.equal(new URL(googleFlightsUrl(unknown)!).pathname, "/travel/flights");
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

/* ── Destinations: separate chips in the input, merged in the search ──── */

check("a city and an airport added on its own are searched as one city", () => {
  const split: SearchQuery = {
    ...QUERY,
    destinations: [
      { cityId: "uk-london", airports: ["LGW", "LHR", "LTN"] },
      { cityId: "uk-london", airports: ["STN"], kind: "airport" },
    ],
  };
  const whole: SearchQuery = {
    ...QUERY,
    destinations: [{ cityId: "uk-london", airports: ["LGW", "LHR", "LTN", "STN"] }],
  };
  assert.deepEqual(mergedDestinations(split), [
    { cityId: "uk-london", airports: ["LGW", "LHR", "LTN", "STN"] },
  ]);
  // Same saved-search key, and exactly the same requests.
  assert.equal(searchKeyOf(split), searchKeyOf(whole));
  assert.deepEqual(planRequestBatches(planSearches(split)), planRequestBatches(planSearches(whole)));
  // An airport both ticked in its city and added on its own counts once.
  const twice: SearchQuery = {
    ...QUERY,
    destinations: [...split.destinations, { cityId: "uk-london", airports: ["LGW"], kind: "airport" }],
  };
  assert.deepEqual(mergedDestinations(twice), mergedDestinations(split));
});

check("an exact airport code is suggested first, and airports aren't crowded out", () => {
  assert.equal(searchPlaces("stn")[0]?.id, "STN");
  const london = searchPlaces("london");
  assert.equal(london[0]?.kind, "city");
  assert.ok(london.filter((s) => s.kind === "airport").length >= 3);
  assert.ok(london.length <= 8);
});

check("clicking a day extends the date range, or shortens it from inside", () => {
  const range = { start: "2026-10-10", end: "2026-10-20" };
  assert.deepEqual(extendRange(null, "2026-10-12"), { start: "2026-10-12", end: "2026-10-12" });
  assert.deepEqual(extendRange(range, "2026-10-25"), { start: "2026-10-10", end: "2026-10-25" });
  assert.deepEqual(extendRange(range, "2026-10-05"), { start: "2026-10-05", end: "2026-10-20" });
  assert.deepEqual(extendRange(range, "2026-10-12"), { start: "2026-10-12", end: "2026-10-20" });
  assert.deepEqual(extendRange(range, "2026-10-18"), { start: "2026-10-10", end: "2026-10-18" });
  assert.deepEqual(extendRange(range, "2026-10-15"), { start: "2026-10-10", end: "2026-10-15" });
});

console.log(`\n${passed} checks passed.`);
