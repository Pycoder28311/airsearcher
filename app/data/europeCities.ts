/**
 * SAMPLE European destinations for the map and the destination search.
 *
 * PLACEHOLDER DATA — deliberately small. The set is chosen to exercise the
 * behaviours the map needs rather than to be complete: several cities have
 * multiple airports (London, Paris, Milan, Rome, Berlin, Stockholm), so the
 * "select a city = select all its airports" and "multi-select within one city
 * only" rules can both be tried. Replace or expand freely.
 *
 * Coordinates are approximate, in decimal degrees.
 */

import type { Airport, City } from "@/lib/airsearcher/types";

export const EUROPE_CITIES: City[] = [
  { id: "uk-london", name: "London", country: "United Kingdom", lat: 51.5074, lon: -0.1278, airportCodes: ["LHR", "LGW", "STN", "LTN"] },
  { id: "fr-paris", name: "Paris", country: "France", lat: 48.8566, lon: 2.3522, airportCodes: ["CDG", "ORY", "BVA"] },
  { id: "it-milan", name: "Milan", country: "Italy", lat: 45.4642, lon: 9.19, airportCodes: ["MXP", "LIN", "BGY"] },
  { id: "it-rome", name: "Rome", country: "Italy", lat: 41.9028, lon: 12.4964, airportCodes: ["FCO", "CIA"] },
  { id: "de-berlin", name: "Berlin", country: "Germany", lat: 52.52, lon: 13.405, airportCodes: ["BER"] },
  { id: "se-stockholm", name: "Stockholm", country: "Sweden", lat: 59.3293, lon: 18.0686, airportCodes: ["ARN", "BMA", "NYO"] },
  { id: "es-madrid", name: "Madrid", country: "Spain", lat: 40.4168, lon: -3.7038, airportCodes: ["MAD"] },
  { id: "es-barcelona", name: "Barcelona", country: "Spain", lat: 41.3874, lon: 2.1686, airportCodes: ["BCN"] },
  { id: "nl-amsterdam", name: "Amsterdam", country: "Netherlands", lat: 52.3676, lon: 4.9041, airportCodes: ["AMS"] },
  { id: "de-munich", name: "Munich", country: "Germany", lat: 48.1351, lon: 11.582, airportCodes: ["MUC"] },
  { id: "de-frankfurt", name: "Frankfurt", country: "Germany", lat: 50.1109, lon: 8.6821, airportCodes: ["FRA"] },
  { id: "at-vienna", name: "Vienna", country: "Austria", lat: 48.2082, lon: 16.3738, airportCodes: ["VIE"] },
  { id: "cz-prague", name: "Prague", country: "Czechia", lat: 50.0755, lon: 14.4378, airportCodes: ["PRG"] },
  { id: "hu-budapest", name: "Budapest", country: "Hungary", lat: 47.4979, lon: 19.0402, airportCodes: ["BUD"] },
  { id: "pl-warsaw", name: "Warsaw", country: "Poland", lat: 52.2297, lon: 21.0122, airportCodes: ["WAW", "WMI"] },
  { id: "pt-lisbon", name: "Lisbon", country: "Portugal", lat: 38.7223, lon: -9.1393, airportCodes: ["LIS"] },
  { id: "ie-dublin", name: "Dublin", country: "Ireland", lat: 53.3498, lon: -6.2603, airportCodes: ["DUB"] },
  { id: "dk-copenhagen", name: "Copenhagen", country: "Denmark", lat: 55.6761, lon: 12.5683, airportCodes: ["CPH"] },
  { id: "no-oslo", name: "Oslo", country: "Norway", lat: 59.9139, lon: 10.7522, airportCodes: ["OSL", "TRF"] },
  { id: "fi-helsinki", name: "Helsinki", country: "Finland", lat: 60.1699, lon: 24.9384, airportCodes: ["HEL"] },
  { id: "be-brussels", name: "Brussels", country: "Belgium", lat: 50.8503, lon: 4.3517, airportCodes: ["BRU", "CRL"] },
  { id: "ch-zurich", name: "Zurich", country: "Switzerland", lat: 47.3769, lon: 8.5417, airportCodes: ["ZRH"] },
  { id: "it-venice", name: "Venice", country: "Italy", lat: 45.4408, lon: 12.3155, airportCodes: ["VCE", "TSF"] },
  { id: "it-naples", name: "Naples", country: "Italy", lat: 40.8518, lon: 14.2681, airportCodes: ["NAP"] },
  { id: "hr-zagreb", name: "Zagreb", country: "Croatia", lat: 45.815, lon: 15.9819, airportCodes: ["ZAG"] },
  { id: "ro-bucharest", name: "Bucharest", country: "Romania", lat: 44.4268, lon: 26.1025, airportCodes: ["OTP"] },
  { id: "bg-sofia", name: "Sofia", country: "Bulgaria", lat: 42.6977, lon: 23.3219, airportCodes: ["SOF"] },
  { id: "tr-istanbul", name: "Istanbul", country: "Türkiye", lat: 41.0082, lon: 28.9784, airportCodes: ["IST", "SAW"] },
  { id: "rs-belgrade", name: "Belgrade", country: "Serbia", lat: 44.7866, lon: 20.4489, airportCodes: ["BEG"] },
  { id: "es-malaga", name: "Malaga", country: "Spain", lat: 36.7213, lon: -4.4214, airportCodes: ["AGP"] },
];

export const EUROPE_AIRPORTS: Airport[] = [
  { code: "LHR", name: "London Heathrow", cityId: "uk-london", lat: 51.47, lon: -0.4543, country: "United Kingdom" },
  { code: "LGW", name: "London Gatwick", cityId: "uk-london", lat: 51.1537, lon: -0.1821, country: "United Kingdom" },
  { code: "STN", name: "London Stansted", cityId: "uk-london", lat: 51.885, lon: 0.235, country: "United Kingdom" },
  { code: "LTN", name: "London Luton", cityId: "uk-london", lat: 51.8747, lon: -0.3683, country: "United Kingdom" },
  { code: "CDG", name: "Paris Charles de Gaulle", cityId: "fr-paris", lat: 49.0097, lon: 2.5479, country: "France" },
  { code: "ORY", name: "Paris Orly", cityId: "fr-paris", lat: 48.7233, lon: 2.3794, country: "France" },
  { code: "BVA", name: "Paris Beauvais", cityId: "fr-paris", lat: 49.4544, lon: 2.1128, country: "France" },
  { code: "MXP", name: "Milan Malpensa", cityId: "it-milan", lat: 45.6306, lon: 8.7281, country: "Italy" },
  { code: "LIN", name: "Milan Linate", cityId: "it-milan", lat: 45.4451, lon: 9.2767, country: "Italy" },
  { code: "BGY", name: "Milan Bergamo", cityId: "it-milan", lat: 45.6739, lon: 9.7042, country: "Italy" },
  { code: "FCO", name: "Rome Fiumicino", cityId: "it-rome", lat: 41.8003, lon: 12.2389, country: "Italy" },
  { code: "CIA", name: "Rome Ciampino", cityId: "it-rome", lat: 41.7994, lon: 12.5949, country: "Italy" },
  { code: "BER", name: "Berlin Brandenburg", cityId: "de-berlin", lat: 52.3667, lon: 13.5033, country: "Germany" },
  { code: "ARN", name: "Stockholm Arlanda", cityId: "se-stockholm", lat: 59.6519, lon: 17.9186, country: "Sweden" },
  { code: "BMA", name: "Stockholm Bromma", cityId: "se-stockholm", lat: 59.3544, lon: 17.9417, country: "Sweden" },
  { code: "NYO", name: "Stockholm Skavsta", cityId: "se-stockholm", lat: 58.7886, lon: 16.9122, country: "Sweden" },
  { code: "MAD", name: "Madrid Barajas", cityId: "es-madrid", lat: 40.4936, lon: -3.5668, country: "Spain" },
  { code: "BCN", name: "Barcelona El Prat", cityId: "es-barcelona", lat: 41.2971, lon: 2.0785, country: "Spain" },
  { code: "AMS", name: "Amsterdam Schiphol", cityId: "nl-amsterdam", lat: 52.3105, lon: 4.7683, country: "Netherlands" },
  { code: "MUC", name: "Munich Franz Josef Strauss", cityId: "de-munich", lat: 48.3538, lon: 11.7861, country: "Germany" },
  { code: "FRA", name: "Frankfurt am Main", cityId: "de-frankfurt", lat: 50.0379, lon: 8.5622, country: "Germany" },
  { code: "VIE", name: "Vienna Schwechat", cityId: "at-vienna", lat: 48.1103, lon: 16.5697, country: "Austria" },
  { code: "PRG", name: "Prague Vaclav Havel", cityId: "cz-prague", lat: 50.1008, lon: 14.26, country: "Czechia" },
  { code: "BUD", name: "Budapest Ferenc Liszt", cityId: "hu-budapest", lat: 47.4369, lon: 19.2556, country: "Hungary" },
  { code: "WAW", name: "Warsaw Chopin", cityId: "pl-warsaw", lat: 52.1657, lon: 20.9671, country: "Poland" },
  { code: "WMI", name: "Warsaw Modlin", cityId: "pl-warsaw", lat: 52.4511, lon: 20.6518, country: "Poland" },
  { code: "LIS", name: "Lisbon Humberto Delgado", cityId: "pt-lisbon", lat: 38.7742, lon: -9.1342, country: "Portugal" },
  { code: "DUB", name: "Dublin", cityId: "ie-dublin", lat: 53.4213, lon: -6.2701, country: "Ireland" },
  { code: "CPH", name: "Copenhagen Kastrup", cityId: "dk-copenhagen", lat: 55.6181, lon: 12.6561, country: "Denmark" },
  { code: "OSL", name: "Oslo Gardermoen", cityId: "no-oslo", lat: 60.1939, lon: 11.1004, country: "Norway" },
  { code: "TRF", name: "Oslo Torp Sandefjord", cityId: "no-oslo", lat: 59.1867, lon: 10.2586, country: "Norway" },
  { code: "HEL", name: "Helsinki Vantaa", cityId: "fi-helsinki", lat: 60.3172, lon: 24.9633, country: "Finland" },
  { code: "BRU", name: "Brussels Zaventem", cityId: "be-brussels", lat: 50.9014, lon: 4.4844, country: "Belgium" },
  { code: "CRL", name: "Brussels Charleroi", cityId: "be-brussels", lat: 50.4592, lon: 4.4538, country: "Belgium" },
  { code: "ZRH", name: "Zurich Kloten", cityId: "ch-zurich", lat: 47.4647, lon: 8.5492, country: "Switzerland" },
  { code: "VCE", name: "Venice Marco Polo", cityId: "it-venice", lat: 45.5053, lon: 12.3519, country: "Italy" },
  { code: "TSF", name: "Venice Treviso", cityId: "it-venice", lat: 45.6484, lon: 12.1944, country: "Italy" },
  { code: "NAP", name: "Naples Capodichino", cityId: "it-naples", lat: 40.8843, lon: 14.2908, country: "Italy" },
  { code: "ZAG", name: "Zagreb Franjo Tudman", cityId: "hr-zagreb", lat: 45.7429, lon: 16.0688, country: "Croatia" },
  { code: "OTP", name: "Bucharest Henri Coanda", cityId: "ro-bucharest", lat: 44.5711, lon: 26.085, country: "Romania" },
  { code: "SOF", name: "Sofia", cityId: "bg-sofia", lat: 42.6967, lon: 23.4114, country: "Bulgaria" },
  { code: "IST", name: "Istanbul", cityId: "tr-istanbul", lat: 41.2753, lon: 28.7519, country: "Türkiye" },
  { code: "SAW", name: "Istanbul Sabiha Gokcen", cityId: "tr-istanbul", lat: 40.8986, lon: 29.3092, country: "Türkiye" },
  { code: "BEG", name: "Belgrade Nikola Tesla", cityId: "rs-belgrade", lat: 44.8184, lon: 20.3091, country: "Serbia" },
  { code: "AGP", name: "Malaga Costa del Sol", cityId: "es-malaga", lat: 36.6749, lon: -4.4991, country: "Spain" },
];

export const EUROPE_AIRPORTS_BY_CODE: Record<string, Airport> = Object.fromEntries(
  EUROPE_AIRPORTS.map((airport) => [airport.code, airport]),
);

export const EUROPE_CITIES_BY_ID: Record<string, City> = Object.fromEntries(
  EUROPE_CITIES.map((city) => [city.id, city]),
);
