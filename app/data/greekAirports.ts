/**
 * Greek commercial airports.
 *
 * Used by the departure dropdown and the "best gathering airport" suggestion.
 * Coordinates are approximate airport positions in decimal degrees, accurate
 * enough for distance comparisons between airports; they are not survey data.
 */

import type { Airport, City } from "@/lib/airsearcher/types";

export const GREEK_AIRPORTS: Airport[] = [
  { code: "ATH", name: "Athens Eleftherios Venizelos", cityId: "gr-athens", lat: 37.9364, lon: 23.9445, country: "Greece" },
  { code: "SKG", name: "Thessaloniki Makedonia", cityId: "gr-thessaloniki", lat: 40.5197, lon: 22.9709, country: "Greece" },
  { code: "HER", name: "Heraklion Nikos Kazantzakis", cityId: "gr-heraklion", lat: 35.3397, lon: 25.1803, country: "Greece" },
  { code: "CHQ", name: "Chania Ioannis Daskalogiannis", cityId: "gr-chania", lat: 35.5317, lon: 24.1497, country: "Greece" },
  { code: "RHO", name: "Rhodes Diagoras", cityId: "gr-rhodes", lat: 36.4054, lon: 28.0862, country: "Greece" },
  { code: "JTR", name: "Santorini (Thira)", cityId: "gr-santorini", lat: 36.3992, lon: 25.4793, country: "Greece" },
  { code: "JMK", name: "Mykonos", cityId: "gr-mykonos", lat: 37.4351, lon: 25.3481, country: "Greece" },
  { code: "CFU", name: "Corfu Ioannis Kapodistrias", cityId: "gr-corfu", lat: 39.6019, lon: 19.9117, country: "Greece" },
  { code: "KGS", name: "Kos Hippocrates", cityId: "gr-kos", lat: 36.7933, lon: 27.0917, country: "Greece" },
  { code: "ZTH", name: "Zakynthos Dionysios Solomos", cityId: "gr-zakynthos", lat: 37.7509, lon: 20.8843, country: "Greece" },
  { code: "PVK", name: "Aktion (Preveza / Lefkada)", cityId: "gr-preveza", lat: 38.9255, lon: 20.7653, country: "Greece" },
  { code: "VOL", name: "Nea Anchialos (Volos)", cityId: "gr-volos", lat: 39.2196, lon: 22.7943, country: "Greece" },
  { code: "SMI", name: "Samos Aristarchos", cityId: "gr-samos", lat: 37.6900, lon: 26.9117, country: "Greece" },
  { code: "MJT", name: "Mytilene (Lesvos)", cityId: "gr-mytilene", lat: 39.0567, lon: 26.5983, country: "Greece" },
  { code: "JSI", name: "Skiathos Alexandros Papadiamantis", cityId: "gr-skiathos", lat: 39.1771, lon: 23.5037, country: "Greece" },
  { code: "EFL", name: "Kefalonia Anna Pollatou", cityId: "gr-kefalonia", lat: 38.1201, lon: 20.5005, country: "Greece" },
  { code: "KVA", name: "Kavala Alexander the Great", cityId: "gr-kavala", lat: 40.9133, lon: 24.6192, country: "Greece" },
  { code: "AXD", name: "Alexandroupoli Dimokritos", cityId: "gr-alexandroupoli", lat: 40.8559, lon: 25.9563, country: "Greece" },
  { code: "GPA", name: "Araxos (Patras)", cityId: "gr-patras", lat: 38.1511, lon: 21.4256, country: "Greece" },
  { code: "LXS", name: "Limnos", cityId: "gr-limnos", lat: 39.9171, lon: 25.2363, country: "Greece" },
  { code: "AOK", name: "Karpathos", cityId: "gr-karpathos", lat: 35.4213, lon: 27.1460, country: "Greece" },
  { code: "KSO", name: "Kastoria Aristotelis", cityId: "gr-kastoria", lat: 40.4463, lon: 21.2822, country: "Greece" },
  { code: "JKH", name: "Chios", cityId: "gr-chios", lat: 38.3432, lon: 26.1406, country: "Greece" },
  { code: "PAS", name: "Paros", cityId: "gr-paros", lat: 37.0203, lon: 25.1130, country: "Greece" },
  { code: "MLO", name: "Milos", cityId: "gr-milos", lat: 36.6969, lon: 24.4769, country: "Greece" },
  { code: "JNX", name: "Naxos", cityId: "gr-naxos", lat: 37.0811, lon: 25.3681, country: "Greece" },
  { code: "KIT", name: "Kithira", cityId: "gr-kithira", lat: 36.2743, lon: 23.0170, country: "Greece" },
  { code: "SKU", name: "Skyros", cityId: "gr-skyros", lat: 38.9676, lon: 24.4872, country: "Greece" },
  { code: "IOA", name: "Ioannina King Pyrrhus", cityId: "gr-ioannina", lat: 39.6963, lon: 20.8225, country: "Greece" },
  { code: "KLX", name: "Kalamata", cityId: "gr-kalamata", lat: 37.0683, lon: 22.0255, country: "Greece" },
];

/** Fast lookup by code. */
export const GREEK_AIRPORTS_BY_CODE: Record<string, Airport> = Object.fromEntries(
  GREEK_AIRPORTS.map((airport) => [airport.code, airport]),
);

/** One city per Greek airport — none of them share a city. */
export const GREEK_CITIES: City[] = GREEK_AIRPORTS.map((airport) => ({
  id: airport.cityId,
  name: airport.name.split(" ")[0].replace(/[()]/g, ""),
  country: "Greece",
  lat: airport.lat,
  lon: airport.lon,
  airportCodes: [airport.code],
}));
