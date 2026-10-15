/*
 * OPTIONAL — opens each search in its own tab, collects it and closes it.
 * Separate on purpose.
 *
 * The dashboard (through opener-relay.js) sends the list of Google Flights
 * links when "Start collecting" is pressed. One tab at a time is opened in
 * front, Google's answer is caught by background.js and sent to the app, then
 * the tab is closed and, `delayMs` later, the next one opens. A tab that gives
 * no answer within TAB_TIMEOUT_MS is closed and the dashboard marks its row as
 * failed. Only tabs opened here are ever closed.
 *
 * To remove it: delete this file and opener-relay.js, delete "opener.js" from
 * the background scripts and the "content_scripts" block in manifest.json,
 * and rebuild the package (build-collector-xpi.py). The one line in
 * background.js that announces an answer is harmless without it.
 */

// Opened in front: a tab behind the one you are looking at doesn't ask Google for its flights.
const OPEN_IN_FRONT = true;
// A run asks for the first page only (the tab closes once it is in, nothing is clicked) or for the
// full list (view-more.js clicks "View more flights" and the tab closes once that list is in).
const TAB_TIMEOUT_MS = 45_000;
const FULL_TIMEOUT_MS = 90_000;
// Full list wanted but only the first page came: if "View more flights" hasn't brought more
// after this long (a short list has no such button), the first page is taken as the result.
const FIRST_ONLY_AFTER_MS = 25_000;
// view-more.js reported there is no "View more flights" button: once the first page is also in,
// wait this long for a late button, then take the first page without asking.
const SETTLE_GRACE_MS = 3000;
// Only Google Flights searches are opened, and never more than this many in a run.
const ALLOWED = "https://www.google.com/travel/flights/search?";
const MAX_TABS = 300;
const MIN_DELAY_MS = 1000;

/** The run in progress: { urls, index, delayMs, jitterMs, fullList, dashboardTab, current, cancelled } or null. */
let run = null;

/** `search[3]` of a GetShoppingResults request: 0 first page, 1 "View more flights". */
function listFlagOf(freq) {
  try {
    const search = JSON.parse(JSON.parse(freq)[1]);
    return typeof search[3] === "number" ? search[3] : null;
  } catch (error) {
    return null;
  }
}

/** The wait before the next tab: delayMs, give or take up to jitterMs at random, never under MIN_DELAY_MS. */
function waitBeforeNext(r) {
  const offset = (Math.random() * 2 - 1) * r.jitterMs;
  return Math.max(MIN_DELAY_MS, Math.round(r.delayMs + offset));
}

function tellDashboard(r, message) {
  if (r.dashboardTab !== undefined) browser.tabs.sendMessage(r.dashboardTab, message).catch(() => {});
}

function cancelRun() {
  const r = run;
  run = null;
  if (!r) return 0;
  r.cancelled = true;
  const left = r.urls.length - r.index + (r.current ? 1 : 0);
  if (r.current) {
    clearTimeout(r.current.timer);
    clearTimeout(r.current.firstTimer);
    clearTimeout(r.current.settleTimer);
    browser.tabs.remove(r.current.tabId).catch(() => {});
    r.current = null;
  }
  return left;
}

async function openNext(r) {
  if (r.cancelled) return;
  if (r.index >= r.urls.length) {
    if (run === r) run = null;
    return;
  }
  const index = r.index++;
  let tab;
  try {
    tab = await browser.tabs.create({ url: r.urls[index], active: OPEN_IN_FRONT });
  } catch (error) {
    tellDashboard(r, { type: "tab-failed", index });
    setTimeout(() => openNext(r), waitBeforeNext(r));
    return;
  }
  if (r.cancelled) {
    browser.tabs.remove(tab.id).catch(() => {});
    return;
  }
  const timeout = r.fullList ? FULL_TIMEOUT_MS : TAB_TIMEOUT_MS;
  const current = { tabId: tab.id, index, timer: setTimeout(() => finish(r, current, false), timeout), firstTimer: null, settleTimer: null, firstAt: null, noButton: false };
  r.current = current;
}

/** Closes the tab, tells the dashboard if it failed, and opens the next after the delay. */
function finish(r, current, ok) {
  if (r.cancelled || r.current !== current) return;
  clearTimeout(current.timer);
  clearTimeout(current.firstTimer);
  clearTimeout(current.settleTimer);
  r.current = null;
  browser.tabs.remove(current.tabId).catch(() => {});
  if (!ok) tellDashboard(r, { type: "tab-failed", index: current.index });
  setTimeout(() => openNext(r), waitBeforeNext(r));
}

/** The full list can't come (no button) and the first page is in: take the first page, and tell the dashboard to. */
function settleWithFirst(r, current) {
  tellDashboard(r, { type: "tab-first-only", index: current.index });
  finish(r, current, true);
}

/** Once the first page is in and the tab has no "View more flights" button, take the first page after a short grace. */
function settleIfReady(r, current) {
  if (current.firstAt && current.noButton && !current.settleTimer) {
    current.settleTimer = setTimeout(() => settleWithFirst(r, current), SETTLE_GRACE_MS);
  }
}

// background.js announces each answer the app took.
document.addEventListener("airsearch-answer-sent", (event) => {
  const { tabId, freq } = event.detail;
  const r = run;
  if (!r || !r.current || r.current.tabId !== tabId) return;
  if (!r.fullList || listFlagOf(freq) === 1) return finish(r, r.current, true);

  // The full list is wanted and only the first page is in: wait for "View more flights", and settle
  // for the first page if nothing more comes (the dashboard is told, so it takes it too).
  const current = r.current;
  current.firstAt = current.firstAt || Date.now();
  if (!current.firstTimer) {
    current.firstTimer = setTimeout(() => settleWithFirst(r, current), FIRST_ONLY_AFTER_MS);
  }
  settleIfReady(r, current);
});

// A tab closed by hand is a failed search, not a reason to wait the full timeout.
browser.tabs.onRemoved.addListener((tabId) => {
  const r = run;
  if (r && r.current && r.current.tabId === tabId) finish(r, r.current, false);
});

browser.runtime.onMessage.addListener((message, sender) => {
  if (!message) return;

  // Asked by view-more.js (optional): should this tab's "View more flights" be clicked?
  if (message.type === "should-click-more") {
    const yes = Boolean(run && run.fullList && run.current && sender.tab && run.current.tabId === sender.tab.id);
    return Promise.resolve({ yes });
  }

  // Sent by view-more.js (optional): this tab has no "View more flights" button.
  if (message.type === "no-more-button") {
    const current = run && run.current;
    if (run && run.fullList && current && sender.tab && current.tabId === sender.tab.id) {
      current.noButton = true;
      settleIfReady(run, current);
    }
    return;
  }

  if (message.type === "cancel-tabs") {
    return Promise.resolve({ ok: true, cancelled: cancelRun() });
  }

  if (message.type === "open-tabs") {
    const urls = Array.isArray(message.urls) ? message.urls : [];
    if (urls.length === 0 || urls.length > MAX_TABS || !urls.every((url) => typeof url === "string" && url.startsWith(ALLOWED))) {
      return Promise.resolve({ ok: false, reason: "not a list of Google Flights searches" });
    }
    cancelRun();
    const delayMs = Math.max(MIN_DELAY_MS, Number(message.delayMs) || 3000);
    const jitterMs = Math.min(delayMs, Math.max(0, Number(message.jitterMs) || 0));
    run = { urls, index: 0, delayMs, jitterMs, fullList: Boolean(message.fullList), dashboardTab: sender.tab ? sender.tab.id : undefined, current: null, cancelled: false };
    openNext(run);
    return Promise.resolve({ ok: true, count: urls.length });
  }
});

// A dashboard tab already open when the extension starts (the browser opens it
// at launch, or the extension was just reloaded) doesn't get the relay by
// itself, since content scripts only reach pages loaded afterwards. Give it
// the relay now, so the dashboard needn't be reloaded.
browser.tabs
  .query({ url: "http://localhost/*" })
  .then((tabs) => {
    for (const tab of tabs) browser.tabs.executeScript(tab.id, { file: "opener-relay.js" }).catch(() => {});
  })
  .catch(() => {});
