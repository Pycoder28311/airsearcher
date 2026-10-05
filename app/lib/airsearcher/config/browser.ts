/**
 * Behaviour of the hidden browser that runs Google Flights searches.
 *
 * Kept next to `constants.ts` rather than in `app/config/`, for the same
 * reason as `curl.ts`: these are behaviour, not the user's style metadata.
 * The pacing between searches is in `pacing.ts`; the cool-down and per-run
 * limit stay in `curl.ts`.
 */

import { browserConfig, type BrowserName } from "@/config/browserConfig";

/** The browser chosen in `app/config/browserConfig.ts`, and whether it runs hidden. */
export const BROWSER_NAME: BrowserName = browserConfig.browser;
export const BROWSER_HEADLESS = browserConfig.headless;

/**
 * How Playwright starts each browser: its engine, the installed browser it
 * drives (`channel`) when not Playwright's own, and the install command.
 */
export const BROWSER_LAUNCH: Record<
  BrowserName,
  { engine: "chromium" | "firefox" | "webkit"; channel?: string; install: string }
> = {
  chromium: { engine: "chromium", install: "npx playwright install chromium" },
  firefox: { engine: "firefox", install: "npx playwright install firefox" },
  webkit: { engine: "webkit", install: "npx playwright install webkit" },
  chrome: { engine: "chromium", channel: "chrome", install: "sudo dnf install google-chrome-stable" },
  "chrome-beta": { engine: "chromium", channel: "chrome-beta", install: "sudo dnf install google-chrome-beta" },
  msedge: {
    engine: "chromium",
    channel: "msedge",
    install: "sudo dnf install microsoft-edge-stable (after adding Microsoft's repository, see app/config/browserConfig.ts)",
  },
};

/**
 * The browser's own profile folder — its cookies (e.g. the consent choice),
 * never the user's real browser. One per browser: Chromium keeps the folder
 * it always had, the others get theirs beside it. Relative to the project
 * folder, unless `AIRSEARCH_BROWSER_PROFILE` says otherwise. Under `data/`,
 * so git ignores it.
 */
export const BROWSER_PROFILE_DIR =
  BROWSER_NAME === "chromium" ? "data/browser-profile" : `data/browser-profile-${BROWSER_NAME}`;

/** Longest wait for the search page to load, consent included. */
export const BROWSER_PAGE_TIMEOUT_MS = 45_000;

/** Longest wait for Google's flight list after the page or a click asked for it. */
export const BROWSER_RESULTS_TIMEOUT_MS = 30_000;

/** The browser closes after this long without a search, to free memory. */
export const BROWSER_IDLE_CLOSE_MS = 5 * 60 * 1000;

/** Rough time one search takes in the browser (page, results, "View more"), for estimates. */
export const BROWSER_SEARCH_ESTIMATE_MS = 12_000;
