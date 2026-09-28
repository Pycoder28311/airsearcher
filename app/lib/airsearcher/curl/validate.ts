/**
 * Decides whether a pasted cURL may be run, and prepares it.
 *
 * Pure and shared: the browser runs it on every row before anything is sent
 * (so a typo never costs a live request), and the server runs it again because
 * the server must never trust the browser.
 */

import {
  CURL_ALLOWED_URL_PREFIX,
  CURL_SHOPPING_RPC,
} from "@/lib/airsearcher/config/curl";
import { CURRENCY } from "@/lib/airsearcher/config/constants";
import { CurlError } from "@/lib/airsearcher/curl/errors";
import { decodeSearch, freqOf, type DecodedSearch } from "@/lib/airsearcher/curl/freq";
import { parseCurl, type ParsedCurl } from "@/lib/airsearcher/curl/parse";

export interface PreparedCurl extends ParsedCurl {
  /** What the body asks for, when it could be read. */
  search: DecodedSearch | null;
  /** Currency the prices will be quoted in, from Google's locale header. */
  currency: string | null;
  /**
   * Identifies the search itself (the `f.req`, not the session token), so the
   * same search pasted twice is only run once.
   */
  fingerprint: string;
  /** Things worth telling the user that do not block the run. */
  warnings: string[];
}

/**
 * Headers curl must compute itself, or that would break reading the answer:
 * Accept-Encoding is replaced by `--compressed`, which only asks for encodings
 * this curl build can decode — not every build has brotli or zstd.
 */
const DROPPED_HEADERS = new Set([
  "content-length",
  "accept-encoding",
  "connection",
  "te",
  "alt-used",
  "host",
  "keep-alive",
  "transfer-encoding",
]);

/**
 * What makes a request signed in. A session cURL is sent without them: Google
 * refuses a changed search from a signed-in session (error 13, or HTTP 400
 * "xsrf" without the `at=` token) but accepts it anonymously. It also means
 * the user's login never leaves the browser that pasted it.
 */
const SIGN_IN_HEADERS = new Set(["cookie", "authorization", "x-goog-authuser"]);

/** `x-goog-ext-259736195-jspb: ["en-GB","GR","EUR",…]` → "EUR". */
function currencyOf(headers: [string, string][]): string | null {
  const header = headers.find(([name]) => name.toLowerCase() === "x-goog-ext-259736195-jspb");
  if (!header) return null;
  try {
    const locale = JSON.parse(header[1]) as unknown;
    const currency = Array.isArray(locale) ? locale[2] : null;
    return typeof currency === "string" && /^[A-Z]{3}$/.test(currency) ? currency : null;
  } catch {
    return null;
  }
}

function checkUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new CurlError("url_not_allowed", "The URL isn't valid.");
  }
  if (parsed.protocol !== "https:" || !url.startsWith(CURL_ALLOWED_URL_PREFIX)) {
    throw new CurlError(
      "url_not_allowed",
      "Only Google Flights data requests (www.google.com/_/FlightsFrontendUi/…) can be run.",
    );
  }
  const rpc = parsed.pathname.split("/").pop();
  if (rpc !== CURL_SHOPPING_RPC) {
    throw new CurlError(
      "rpc_not_supported",
      `This is the “${rpc}” request. Copy the “${CURL_SHOPPING_RPC}” request instead — it's the one that returns the flight list.`,
    );
  }
}

const LOCALE_HEADER = "x-goog-ext-259736195-jspb";

/**
 * The locale header with its currency set to the app's own, so prices from
 * generated searches are always in CURRENCY whatever the cURL was copied with.
 * Language and country are kept. Left unchanged when it can't be read.
 */
function withAppCurrency(headers: [string, string][]): [string, string][] {
  return headers.map(([name, value]) => {
    if (name.toLowerCase() !== LOCALE_HEADER) return [name, value];
    try {
      const locale = JSON.parse(value) as unknown;
      if (!Array.isArray(locale)) return [name, value];
      locale[2] = CURRENCY;
      return [name, JSON.stringify(locale)];
    } catch {
      return [name, value];
    }
  });
}

/**
 * "search" — the cURL is run as pasted: it must be a one-way search.
 * "template" — only its session is used; the search itself is replaced
 * (see `rewriteSearch`), so its trip type and passengers don't matter, and its
 * prices are forced into the app's currency. Its cookies are removed, so the
 * searches go out anonymously.
 */
export type CurlMode = "search" | "template";

export function prepareCurl(text: string, options: { mode?: CurlMode } = {}): PreparedCurl {
  const template = options.mode === "template";
  const parsed = parseCurl(text);
  checkUrl(parsed.url);

  if (parsed.method === "POST" && !freqOf(parsed.body)) {
    throw new CurlError(
      "missing_body",
      "This cURL is a POST without a body (--data-raw 'f.req=…'), so it doesn't say which flights to search. Copy it again with “Copy as cURL” on the GetShoppingResults request.",
    );
  }

  const search = decodeSearch(parsed.body);
  const notOneWay =
    search?.tripType === "round-trip" ||
    search?.tripType === "multi-city" ||
    (search !== null && search.legs.length > 1);
  if (!template && notOneWay) {
    throw new CurlError(
      "round_trip",
      "This is a round-trip or multi-city search. Copy one-way searches instead, one per direction.",
    );
  }

  const warnings: string[] = [];
  if (template) {
    if (!search) {
      throw new CurlError(
        "template_unrecognised",
        "This cURL can't be used as a session — copy a GetShoppingResults request.",
      );
    }
  } else if (!search) {
    warnings.push("The search in the body couldn't be read; flights are matched to routes by their airports and dates.");
  } else if (search.passengers > 1) {
    warnings.push(`Prices are quoted for ${search.passengers} passengers and are divided back to one.`);
  }

  const kept = parsed.headers.filter(([name]) => {
    const lower = name.toLowerCase();
    return !DROPPED_HEADERS.has(lower) && !(template && SIGN_IN_HEADERS.has(lower));
  });
  return {
    ...parsed,
    headers: template ? withAppCurrency(kept) : kept,
    search,
    currency: template ? CURRENCY : currencyOf(parsed.headers),
    fingerprint: `${new URL(parsed.url).pathname}|${freqOf(parsed.body) ?? ""}`,
    warnings,
  };
}
