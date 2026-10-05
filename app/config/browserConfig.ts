/**
 * Which browser runs the Google Flights searches, hidden in the background.
 *
 * Pick one name from BROWSERS below and put it in `browserConfig.browser`.
 * Restart `npm run dev` afterwards: the browser stays open between searches.
 *
 * Each browser keeps its own profile folder (cookies, consent choice), so
 * switching starts the new one fresh and keeps the old one's for later.
 */

export const BROWSERS = {
  /** Playwright's own Chromium. Installed. (npx playwright install chromium) */
  chromium: "Chromium (Playwright's)",
  /** Playwright's own Firefox. Installed. (npx playwright install firefox) */
  firefox: "Firefox (Playwright's)",
  /**
   * Playwright's WebKit, the engine of Safari. Downloaded, but it doesn't run
   * on Fedora: it is built for Ubuntu and needs Ubuntu's library versions.
   */
  webkit: "WebKit (Safari's engine)",
  /** Google Chrome installed on this computer. Fedora: sudo dnf install google-chrome-stable */
  chrome: "Google Chrome (installed)",
  /** Google Chrome Beta installed on this computer. Fedora: sudo dnf install google-chrome-beta */
  "chrome-beta": "Google Chrome Beta (installed)",
  /**
   * Microsoft Edge installed on this computer. Fedora:
   *   sudo rpm --import https://packages.microsoft.com/keys/microsoft.asc
   *   sudo dnf config-manager addrepo --from-repofile=https://packages.microsoft.com/yumrepos/edge/config.repo
   *   sudo dnf install microsoft-edge-stable
   */
  msedge: "Microsoft Edge (installed)",
} as const;

export type BrowserName = keyof typeof BROWSERS;

export const browserConfig: {
  /** One of: "chromium", "firefox", "webkit", "chrome", "chrome-beta", "msedge". */
  browser: BrowserName;
  /** true runs it hidden; false opens a window, to watch each search. */
  headless: boolean;
} = {
  browser: "chromium",
  headless: true,
};
