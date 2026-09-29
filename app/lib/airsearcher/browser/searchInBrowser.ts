/**
 * Runs one Google Flights search in a hidden browser. Server-only.
 *
 * The browser does what a person does: it opens the search's Google Flights
 * page, lets Google's own page ask for the flights, and clicks "View more
 * flights". The app only listens to the answers the page receives
 * (GetShoppingResults) and keeps the full list. Nothing is sent that the page
 * didn't send itself, so there is no request to rebuild and no cURL to copy.
 *
 * The browser has its own profile (see BROWSER_PROFILE_DIR), never signed in.
 * It stays open between searches and closes after BROWSER_IDLE_CLOSE_MS idle.
 * Pacing between searches is the caller's job (the shared gate in the route).
 */

import path from "node:path";
import { chromium, type BrowserContext, type Page, type Response } from "playwright";
import {
  BROWSER_IDLE_CLOSE_MS,
  BROWSER_PAGE_TIMEOUT_MS,
  BROWSER_PROFILE_DIR,
  BROWSER_RESULTS_TIMEOUT_MS,
} from "@/lib/airsearcher/config/browser";
import { CURL_SHOPPING_RPC } from "@/lib/airsearcher/config/curl";
import { CurlError } from "@/lib/airsearcher/curl/errors";
import { decodeSearch, freqOf, type GeneratedSearch } from "@/lib/airsearcher/curl/freq";
import { airports, googleFlightsSearchUrl } from "@/lib/airsearcher/curl/googleLink";

if (typeof window !== "undefined") {
  throw new Error("searchInBrowser.ts is server-only.");
}

/* ── The one browser, kept across searches and hot reloads ────────────────── */

const globalBrowser = globalThis as typeof globalThis & {
  __airsearcherBrowser?: Promise<BrowserContext>;
  __airsearcherBrowserIdle?: ReturnType<typeof setTimeout>;
};

function profileDir(): string {
  return path.resolve(process.cwd(), process.env.AIRSEARCH_BROWSER_PROFILE || BROWSER_PROFILE_DIR);
}

async function launch(): Promise<BrowserContext> {
  try {
    const context = await chromium.launchPersistentContext(profileDir(), {
      headless: true,
      locale: "en-GB",
      viewport: { width: 1280, height: 900 },
    });
    // If it closes on its own (crash, killed), the next search starts a new one.
    context.on("close", () => {
      globalBrowser.__airsearcherBrowser = undefined;
    });
    return context;
  } catch (error) {
    globalBrowser.__airsearcherBrowser = undefined;
    const missing = error instanceof Error && /Executable doesn't exist|playwright install/i.test(error.message);
    throw new CurlError(
      missing ? "browser_missing" : "network",
      missing
        ? "The search browser isn't installed. Run “npx playwright install chromium” in the project folder."
        : "The search browser couldn't be started.",
    );
  }
}

function browser(): Promise<BrowserContext> {
  return (globalBrowser.__airsearcherBrowser ??= launch());
}

/** Restarts the idle countdown; the browser closes when it runs out. */
function touchIdle(): void {
  if (globalBrowser.__airsearcherBrowserIdle) clearTimeout(globalBrowser.__airsearcherBrowserIdle);
  globalBrowser.__airsearcherBrowserIdle = setTimeout(() => {
    const open = globalBrowser.__airsearcherBrowser;
    globalBrowser.__airsearcherBrowser = undefined;
    void open?.then((context) => context.close()).catch(() => {});
  }, BROWSER_IDLE_CLOSE_MS);
}

/* ── Reading what the page asks Google ─────────────────────────────────────── */

/** `search[3]` of a GetShoppingResults body: 0 first page, 1 "View more flights". */
function listFlagOf(postData: string | null): number | null {
  const freq = freqOf(postData);
  if (!freq) return null;
  try {
    const outer = JSON.parse(freq) as unknown[];
    const search = JSON.parse(String(outer[1])) as unknown[];
    return typeof search[3] === "number" ? search[3] : null;
  } catch {
    return null;
  }
}

function isShopping(response: Response): boolean {
  return response.url().split("?")[0].endsWith(`/${CURL_SHOPPING_RPC}`) && response.request().method() === "POST";
}

/** Whether the page searched exactly what was asked: same airports and date. */
function matches(postData: string | null, search: GeneratedSearch): boolean {
  const leg = decodeSearch(postData)?.legs[0];
  if (!leg) return false;
  const same = (a: string[], b: string[]) => a.length === b.length && [...a].sort().join() === [...b].sort().join();
  return leg.date === search.date && same(leg.from, search.from) && same(leg.to, search.to);
}

function blockedPage(page: Page): boolean {
  return /\/sorry\//.test(page.url());
}

/* ── One search ────────────────────────────────────────────────────────────── */

export interface BrowserAnswer {
  /** The GetShoppingResults answer, in the same format the cURL runner read. */
  body: string;
  httpStatus: number;
  /** Which list it is: the full one, or the first page when there was no more. */
  list: "all" | "first";
}

export async function searchInBrowser(search: GeneratedSearch, signal?: AbortSignal): Promise<BrowserAnswer> {
  if (signal?.aborted) throw new CurlError("aborted", "The run was stopped.");
  const context = await browser();
  touchIdle();
  const page = await context.newPage();
  const onAbort = () => void page.close().catch(() => {});
  signal?.addEventListener("abort", onAbort, { once: true });

  try {
    // Listen before loading, so an answer that arrives with the page isn't missed.
    const firstPage = page.waitForResponse(
      (response) => isShopping(response) && listFlagOf(response.request().postData()) !== 1,
      { timeout: BROWSER_PAGE_TIMEOUT_MS + BROWSER_RESULTS_TIMEOUT_MS },
    );
    firstPage.catch(() => {});

    const url = googleFlightsSearchUrl({ from: airports(search.from), to: airports(search.to), date: search.date });
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: BROWSER_PAGE_TIMEOUT_MS });

    // Google's cookie consent, shown once per profile in the EU: decline.
    if (page.url().includes("consent.google.")) {
      await page.getByRole("button", { name: /reject all/i }).first().click({ timeout: BROWSER_RESULTS_TIMEOUT_MS });
      await page.waitForURL(/\/travel\/flights/, { timeout: BROWSER_PAGE_TIMEOUT_MS });
    }
    if (blockedPage(page)) {
      throw new CurlError("rate_limited", "Google is asking for a captcha. The runner pauses for a while; wait before trying again.");
    }

    const first = await firstPage;
    if (!matches(first.request().postData(), search)) {
      throw new CurlError("unrecognised_response", "Google Flights opened a different search than the one asked for.");
    }

    // "View more flights" asks for the full list; without it, the first page is all.
    const more = page.getByRole("button", { name: /more flights/i }).first();
    const hasMore = await more
      .waitFor({ state: "visible", timeout: 8_000 })
      .then(() => true)
      .catch(() => false);
    if (!hasMore) {
      return { body: await first.text(), httpStatus: first.status(), list: "first" };
    }

    const full = page.waitForResponse(
      (response) => isShopping(response) && listFlagOf(response.request().postData()) === 1,
      { timeout: BROWSER_RESULTS_TIMEOUT_MS },
    );
    await more.click();
    const answer = await full;
    if (blockedPage(page)) {
      throw new CurlError("rate_limited", "Google is asking for a captcha. The runner pauses for a while; wait before trying again.");
    }
    return { body: await answer.text(), httpStatus: answer.status(), list: "all" };
  } catch (error) {
    if (signal?.aborted) throw new CurlError("aborted", "The run was stopped.");
    if (error instanceof CurlError) throw error;
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    throw new CurlError(
      timedOut ? "timeout" : "network",
      timedOut ? "Google Flights didn't show the flights in time." : "The search page couldn't be loaded.",
    );
  } finally {
    signal?.removeEventListener("abort", onAbort);
    await page.close().catch(() => {});
    touchIdle();
  }
}
