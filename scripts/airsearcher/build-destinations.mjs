/**
 * Builds AirSearcher's European destination list: every city with a scheduled
 * airport, plus rural places (UNESCO World Heritage sites and national parks)
 * with the airports you can realistically drive to from them.
 *
 *   node scripts/airsearcher/build-destinations.mjs
 *
 * Output: app/data/europeDestinations.generated.json, in the app's own `City`
 * and `Airport` shapes, read by app/data/europeCities.ts.
 *
 * Sources, all free:
 *   - Travelpayouts data API — cities, and which city each airport serves
 *   - OurAirports (public domain) — airport size and "has scheduled flights"
 *   - UNESCO World Heritage Centre list — World Heritage sites (needs curl)
 *   - Wikidata (CC0) — national parks with coordinates
 *   - OSRM public server (OpenStreetMap roads) — driving times to airports
 *
 * Every download is cached in scripts/airsearcher/.cache, driving times per
 * place included, so a re-run only fetches what is new. Delete the cache to
 * refresh. The OSRM demo server asks for at most one request per second, which
 * this script respects — a cold run takes roughly half an hour.
 *
 * Hand corrections go in destination-overrides.json next to this file:
 *   { "gr-meteora": ["SKG", "IOA", "VOL"] }
 * replaces the computed airports of that destination.
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const CACHE = join(HERE, ".cache");
const OUTPUT = join(ROOT, "app", "data", "europeDestinations.generated.json");
const OVERRIDES = join(HERE, "destination-overrides.json");

/* ── Rules ──────────────────────────────────────────────────────────────── */

/**
 * The countries treated as Europe. Russia, Belarus and Ukraine are left out:
 * there are no flights to them from the EU. Türkiye and Cyprus are in.
 */
const EUROPE = new Set(
  (
    "AD AL AT AX BA BE BG CH CY CZ DE DK EE ES FI FO FR GB GG GI GR HR HU IE IM IS IT JE " +
    "LI LT LU LV MC MD ME MK MT NL NO PL PT RO RS SE SI SK SM TR VA XK"
  ).split(" "),
);

/**
 * Longest drive from a rural place to a medium airport, in OSRM minutes. The
 * public OSRM server is pessimistic — about a fifth slower than real driving
 * (Delphi to Athens: 2 h 55 by OSRM, about 2 h 20 in practice) — so this is
 * roughly two and a quarter real hours.
 */
const MAX_DRIVE_MEDIUM = 170;
/** Large airports are worth a longer drive: roughly three real hours. */
const MAX_DRIVE_LARGE = 220;
/** Ranking credit for a large airport: it is worth this many minutes more driving. */
const LARGE_AIRPORT_BONUS = 30;
/** Most airports offered for one rural place. */
const MAX_AIRPORTS_PER_PLACE = 5;
/**
 * Most airports timed per place, nearest first in a straight line. High on
 * purpose: small airports near a place can crowd out the big one that is
 * actually worth the drive (Athens, for Delphi).
 */
const CANDIDATES_PER_PLACE = 25;
/** Straight-line radius airports are looked for in. */
const SEARCH_RADIUS_KM = 250;
/** A rural place this close to a city with an airport is that city. */
const CITY_ABSORB_KM = 20;
/**
 * When the roads find nothing in range, airports this close in a straight
 * line are used instead. It covers islands without a bridge, and places whose
 * coordinate lies off-road — the middle of Samaria gorge snaps to a coast
 * reachable only by ferry.
 */
const NO_ROAD_FALLBACK_KM = 80;
/** Most airports taken by that fallback. */
const MAX_FALLBACK_AIRPORTS = 3;
/** Pause between OSRM calls, to respect the public server's limit. */
const OSRM_DELAY_MS = 1100;

/* ── Helpers ─────────────────────────────────────────────────────────────── */

mkdirSync(CACHE, { recursive: true });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchText(url, init, attempts = 4) {
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch(url, { ...init, signal: AbortSignal.timeout(120_000) });
      if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
      return await response.text();
    } catch (error) {
      if (attempt >= attempts) throw error;
      await sleep(2000 * attempt);
    }
  }
}

/** A download, cached on disk under `name`. */
async function cached(name, load) {
  const file = join(CACHE, name);
  if (existsSync(file)) return readFileSync(file, "utf8");
  const text = await load();
  writeFileSync(file, text);
  return text;
}

function haversineKm(a, b) {
  const R = 6371;
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function slug(text) {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** The app's id prefix: lower-case ISO code, except the UK keeps "uk". */
const idPrefix = (country) => (country === "GB" ? "uk" : country.toLowerCase());

const round4 = (n) => Math.round(n * 10_000) / 10_000;

/** Minimal CSV parser: quoted fields, commas inside quotes. */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (ch !== "\r") field += ch;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  const [header, ...body] = rows;
  return body.map((r) => Object.fromEntries(header.map((key, i) => [key, r[i] ?? ""])));
}

/** "London Heathrow Airport" -> "London Heathrow". */
function shortAirportName(name) {
  return name
    .replace(/\s+(International\s+)?Airport$/i, "")
    .replace(/\s+Air(port|field)\s*$/i, "")
    .trim();
}

/* ── 1. Airports ─────────────────────────────────────────────────────────── */

console.log("Downloading airport and city data…");

const [tpAirports, tpCities, tpCountries, ourAirports] = await Promise.all([
  cached("tp-airports.json", () => fetchText("https://api.travelpayouts.com/data/en/airports.json")).then(JSON.parse),
  cached("tp-cities.json", () => fetchText("https://api.travelpayouts.com/data/en/cities.json")).then(JSON.parse),
  cached("tp-countries.json", () => fetchText("https://api.travelpayouts.com/data/en/countries.json")).then(JSON.parse),
  cached("ourairports.csv", () => fetchText("https://davidmegginson.github.io/ourairports-data/airports.csv")).then(parseCsv),
]);

const tpAirportByCode = new Map(tpAirports.map((a) => [a.code, a]));
const tpCityByCode = new Map(tpCities.map((c) => [c.code, c]));
const countryName = new Map(tpCountries.map((c) => [c.code, c.name]));
// Names people recognise rather than the formal ones.
countryName.set("CZ", "Czechia");
countryName.set("TR", "Türkiye");
countryName.set("MK", "North Macedonia");
countryName.set("MD", "Moldova");

/**
 * Airports with scheduled passenger service, still open. OurAirports decides
 * whether flights are scheduled; Travelpayouts' own flag drops airports it
 * knows to be closed (Berlin Tegel, for one).
 */
const airports = ourAirports
  .filter(
    (a) =>
      EUROPE.has(a.iso_country) &&
      /^[A-Z]{3}$/.test(a.iata_code) &&
      a.scheduled_service === "yes" &&
      ["large_airport", "medium_airport", "small_airport"].includes(a.type) &&
      tpAirportByCode.get(a.iata_code)?.flightable !== false,
  )
  .map((a) => {
    const tp = tpAirportByCode.get(a.iata_code);
    return {
      code: a.iata_code,
      name: shortAirportName(a.name),
      size: a.type.replace("_airport", ""),
      lat: Number(a.latitude_deg),
      lon: Number(a.longitude_deg),
      country: a.iso_country,
      cityCode: tp?.city_code ?? a.iata_code,
      municipality: a.municipality,
    };
  });

console.log(`  ${airports.length} European airports with scheduled flights`);

/* ── 2. Cities ───────────────────────────────────────────────────────────── */

/** City code -> the city record being built. */
const citiesByCode = new Map();
const usedIds = new Set();

function uniqueId(prefix, name) {
  const base = `${prefix}-${slug(name) || "place"}`;
  let id = base;
  for (let n = 2; usedIds.has(id); n++) id = `${base}-${n}`;
  usedIds.add(id);
  return id;
}

for (const airport of airports) {
  let city = citiesByCode.get(airport.cityCode);
  if (!city) {
    const tp = tpCityByCode.get(airport.cityCode);
    const name = tp?.name_translations?.en ?? tp?.name ?? airport.municipality ?? airport.name;
    const country = tp?.country_code && EUROPE.has(tp.country_code) ? tp.country_code : airport.country;
    city = {
      code: airport.cityCode,
      name,
      countryCode: country,
      lat: tp?.coordinates?.lat ?? airport.lat,
      lon: tp?.coordinates?.lon ?? airport.lon,
      airports: [],
    };
    citiesByCode.set(airport.cityCode, city);
  }
  city.airports.push(airport);
}

// Biggest first: the destination dropdown shows the first few before anyone types.
const sizeRank = { large: 0, medium: 1, small: 2 };
const cityWeight = (c) =>
  c.airports.filter((a) => a.size === "large").length * 10 +
  c.airports.filter((a) => a.size === "medium").length * 3 +
  c.airports.length;

const cityList = [...citiesByCode.values()].sort(
  (a, b) => cityWeight(b) - cityWeight(a) || a.name.localeCompare(b.name),
);
for (const city of cityList) {
  city.id = uniqueId(idPrefix(city.countryCode), city.name);
  city.airports.sort((a, b) => sizeRank[a.size] - sizeRank[b.size] || a.code.localeCompare(b.code));
}

console.log(`  ${cityList.length} cities`);

/* ── 3. Rural places from Wikidata ───────────────────────────────────────── */

console.log("Downloading UNESCO sites and national parks from Wikidata…");

async function sparql(name, query) {
  const text = await cached(name, async () => {
    const body = await fetchText(`https://query.wikidata.org/sparql?query=${encodeURIComponent(query)}`, {
      headers: {
        Accept: "application/sparql-results+json",
        "User-Agent": "AirSearcher-destination-builder/1.0 (one-off data build)",
      },
    });
    // A query that times out still answers 200, with the error appended to a
    // truncated body. Parsing here keeps a broken answer out of the cache.
    JSON.parse(body);
    return body;
  });
  return JSON.parse(text).results.bindings;
}

/**
 * UNESCO's own list. Sites spanning several countries are left out: a single
 * airport list cannot serve a site scattered across Europe. A site listed at
 * several points sits at their centre.
 */
function unescoPlaces(xml) {
  const tag = (row, name) => new RegExp(`<${name}>([\\s\\S]*?)</${name}>`).exec(row)?.[1] ?? "";
  const decode = (text) =>
    text
      .replace(/<[^>]+>/g, "")
      .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
      .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#0?39;|&apos;/g, "'")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .trim();

  return xml
    .split("<row>")
    .slice(1)
    .filter((row) => tag(row, "transnational") !== "1")
    .map((row) => {
      const points = [...row.matchAll(/<latitude>([-\d.]+)<\/latitude>\s*<longitude>([-\d.]+)<\/longitude>/g)].map(
        (m) => ({ lat: Number(m[1]), lon: Number(m[2]) }),
      );
      const countries = tag(row, "iso_code").toUpperCase().split(",").filter(Boolean);
      if (points.length === 0 || countries.length !== 1) return null;
      return {
        label: decode(tag(row, "site")),
        kind: "unesco",
        countryCode: countries[0],
        lat: points.reduce((sum, p) => sum + p.lat, 0) / points.length,
        lon: points.reduce((sum, p) => sum + p.lon, 0) / points.length,
      };
    })
    .filter((p) => p && p.label && EUROPE.has(p.countryCode));
}

/** Wikidata's national parks in European countries, one row per park. */
function parkPlaces(rows) {
  const byItem = new Map();
  for (const row of rows) {
    const match = /Point\(([-\d.]+) ([-\d.]+)\)/.exec(row.coord.value);
    const label = row.itemLabel?.value ?? "";
    // No English name: the label service falls back to the bare Q-id.
    if (!match || /^Q\d+$/.test(label)) continue;
    const entry = byItem.get(row.item.value) ?? {
      label,
      kind: "park",
      countries: new Set(),
      lat: Number(match[2]),
      lon: Number(match[1]),
    };
    entry.countries.add(row.iso.value);
    byItem.set(row.item.value, entry);
  }
  return [...byItem.values()]
    .filter((p) => p.countries.size === 1)
    .map(({ countries, ...p }) => ({ ...p, countryCode: [...countries][0] }))
    .filter((p) => EUROPE.has(p.countryCode));
}

const [unescoXml, parks] = await Promise.all([
  // UNESCO's firewall turns Node's fetch away but serves curl.
  cached("unesco-whc.xml", async () =>
    execFileSync(
      "curl",
      ["-sfL", "--max-time", "120", "-A", "Mozilla/5.0 AirSearcher-destination-builder/1.0", "https://whc.unesco.org/en/list/xml/"],
      { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
    ),
  ),
  sparql(
    "wikidata-parks.json",
    `SELECT ?item ?itemLabel ?coord ?iso WHERE {
      ?item wdt:P31/wdt:P279* wd:Q46169; wdt:P17 ?country; wdt:P625 ?coord.
      ?country wdt:P297 ?iso; wdt:P30 wd:Q46.
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
    }`,
  ),
]);

const cityPoints = cityList.map((c) => ({ lat: c.lat, lon: c.lon, name: c.name.toLowerCase() }));
const seenPlaceNames = new Set();
/**
 * Geographic Europe, Canaries and Azores included. France's and Denmark's
 * overseas sites (Réunion, the Pacific, Greenland) sit outside it.
 */
const inEurope = (p) => p.lat >= 27 && p.lat <= 72 && p.lon >= -32 && p.lon <= 45;

const places = [...unescoPlaces(unescoXml), ...parkPlaces(parks)].filter(inEurope).filter((p) => {
  const key = `${p.countryCode}:${p.label.toLowerCase()}`;
  if (seenPlaceNames.has(key)) return false;
  seenPlaceNames.add(key);
  // Inside or next to a city that has its own airport: the city covers it.
  return !cityPoints.some(
    (c) => c.name === p.label.toLowerCase() || haversineKm(c, p) < CITY_ABSORB_KM,
  );
});

console.log(`  ${places.length} rural places to resolve`);

/* ── 4. Driving times ────────────────────────────────────────────────────── */

const candidateAirports = airports.filter((a) => a.size === "large" || a.size === "medium");

/** Minutes by road from the place to each airport; null where there is no road. */
async function drivingMinutes(place, targets) {
  const key = `${place.lat.toFixed(4)},${place.lon.toFixed(4)}:${targets.map((t) => t.code).join(",")}`;
  const file = join(CACHE, "osrm", `${slug(key)}.json`);
  if (existsSync(file)) return JSON.parse(readFileSync(file, "utf8"));

  const coords = [place, ...targets].map((p) => `${p.lon},${p.lat}`).join(";");
  const url = `https://router.project-osrm.org/table/v1/driving/${coords}?sources=0&annotations=duration`;
  await sleep(OSRM_DELAY_MS);
  const data = JSON.parse(await fetchText(url, { headers: { "User-Agent": "AirSearcher-destination-builder/1.0" } }));
  if (data.code !== "Ok") throw new Error(`OSRM: ${data.code} ${data.message ?? ""}`);

  // OSRM snaps both ends to the nearest road. A snap more than 15 km away means
  // the point is not really reachable by road (a remote island, open water).
  const snapOk = (i) => (data.destinations[i]?.distance ?? 0) < 15_000;
  const sourceOk = (data.sources[0]?.distance ?? 0) < 15_000;
  const minutes = Object.fromEntries(
    targets.map((t, i) => {
      const seconds = data.durations[0][i + 1];
      const ok = sourceOk && snapOk(i + 1) && seconds !== null;
      return [t.code, ok ? Math.round(seconds / 60) : null];
    }),
  );

  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(minutes));
  return minutes;
}

const overrides = existsSync(OVERRIDES) ? JSON.parse(readFileSync(OVERRIDES, "utf8")) : {};
const airportByCode = new Map(airports.map((a) => [a.code, a]));

const resolved = [];
const dropped = [];
let done = 0;

// LIMIT=20 resolves only the first few places — a quick trial run.
const limit = Number(process.env.LIMIT ?? Infinity);

for (const place of places.slice(0, limit)) {
  done++;
  if (done % 50 === 0) console.log(`  ${done}/${places.length} places…`);

  const nearby = candidateAirports
    .map((a) => ({ airport: a, km: haversineKm(place, a) }))
    .filter((c) => c.km <= SEARCH_RADIUS_KM)
    .sort((a, b) => a.km - b.km)
    .slice(0, CANDIDATES_PER_PLACE);
  if (nearby.length === 0) {
    dropped.push(`${place.label} (${place.countryCode}): no airport within ${SEARCH_RADIUS_KM} km`);
    continue;
  }

  let minutes;
  try {
    minutes = await drivingMinutes(place, nearby.map((c) => c.airport));
  } catch (error) {
    dropped.push(`${place.label} (${place.countryCode}): routing failed — ${error.message}`);
    continue;
  }

  let chosen = nearby
    .filter(({ airport }) => {
      const drive = minutes[airport.code];
      if (drive === null || drive === undefined) return false;
      return drive <= (airport.size === "large" ? MAX_DRIVE_LARGE : MAX_DRIVE_MEDIUM);
    })
    .map(({ airport }) => ({
      airport,
      drive: minutes[airport.code],
      rank: minutes[airport.code] - (airport.size === "large" ? LARGE_AIRPORT_BONUS : 0),
    }));

  // Nothing in range by road: an island, or a coordinate the roads cannot
  // reach. The closest airports in a straight line stand in, with no drive
  // time shown, since the one OSRM gave is not trustworthy.
  if (chosen.length === 0) {
    chosen = nearby
      .filter((c) => c.km <= NO_ROAD_FALLBACK_KM)
      .slice(0, MAX_FALLBACK_AIRPORTS)
      .map((c) => ({ airport: c.airport, drive: null, rank: c.km }));
  }

  chosen = chosen.sort((a, b) => a.rank - b.rank).slice(0, MAX_AIRPORTS_PER_PLACE);
  if (chosen.length === 0) {
    dropped.push(`${place.label} (${place.countryCode}): no airport within driving range`);
    continue;
  }

  resolved.push({ place, chosen });
}

/* ── 5. Output in the app's shapes ───────────────────────────────────────── */

const cityOut = cityList.map((city) => ({
  id: city.id,
  name: city.name,
  country: countryName.get(city.countryCode) ?? city.countryCode,
  lat: round4(city.lat),
  lon: round4(city.lon),
  airportCodes: city.airports.map((a) => a.code),
  kind: "city",
}));

const cityIdByCode = new Map(cityList.map((c) => [c.code, c.id]));

const placeOut = resolved
  .sort((a, b) => a.place.label.localeCompare(b.place.label))
  .map(({ place, chosen }) => {
    const id = uniqueId(idPrefix(place.countryCode), place.label);
    const override = overrides[id];
    const codes = Array.isArray(override)
      ? override.filter((code) => airportByCode.has(code))
      : chosen.map((c) => c.airport.code);
    const driveMinutes = Object.fromEntries(
      chosen.filter((c) => c.drive !== null).map((c) => [c.airport.code, c.drive]),
    );
    return {
      id,
      name: place.label,
      country: countryName.get(place.countryCode) ?? place.countryCode,
      lat: round4(place.lat),
      lon: round4(place.lon),
      airportCodes: codes,
      kind: place.kind,
      driveMinutes,
    };
  });

const airportOut = airports
  .sort((a, b) => a.code.localeCompare(b.code))
  .map((a) => ({
    code: a.code,
    name: a.name,
    cityId: cityIdByCode.get(a.cityCode),
    lat: round4(a.lat),
    lon: round4(a.lon),
    country: countryName.get(a.country) ?? a.country,
  }));

writeFileSync(
  OUTPUT,
  `${JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      sources: [
        "Travelpayouts data API",
        "OurAirports (public domain)",
        "Wikidata (CC0)",
        "OSRM / OpenStreetMap contributors (ODbL)",
      ],
      cities: [...cityOut, ...placeOut],
      airports: airportOut,
    },
    null,
    0,
  )}\n`,
);

// The review list: every rural place with its airports and drives.
const review = placeOut
  .map((p) => {
    const list = p.airportCodes
      .map((code) => (p.driveMinutes[code] !== undefined ? `${code} ${p.driveMinutes[code]}m` : code))
      .join(", ");
    return `${p.name} (${p.country}, ${p.kind}): ${list}`;
  })
  .join("\n");
writeFileSync(join(HERE, "destinations-review.txt"), `${review}\n\nDropped:\n${dropped.join("\n")}\n`);

console.log(
  `Done: ${cityOut.length} cities + ${placeOut.length} rural places, ${airportOut.length} airports. ` +
    `${dropped.length} places dropped. Review list: scripts/airsearcher/destinations-review.txt`,
);
