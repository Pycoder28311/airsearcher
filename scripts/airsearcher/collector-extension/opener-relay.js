/*
 * OPTIONAL — part of the tab opener (see opener.js). Runs on the dashboard
 * page only. It passes the page's "open these tabs" / "cancel" requests to the
 * extension and tells the page they were heard, and it tells the page when a
 * search's tab failed or settled for its first page.
 */

// The relay can reach a page twice (loaded with it, and given by opener.js); one is enough.
if (!window.__airsearchRelay) {
window.__airsearchRelay = true;

window.addEventListener("message", (event) => {
  const data = event.data;
  if (event.source !== window || !data || data.source !== "airsearch-dashboard") return;
  if (data.type !== "open-tabs" && data.type !== "cancel-tabs") return;

  browser.runtime
    .sendMessage({ type: data.type, urls: data.urls, delayMs: data.delayMs, jitterMs: data.jitterMs, fullList: data.fullList })
    .then((reply) => window.postMessage({ source: "airsearch-extension", type: data.type, reply }, "*"))
    .catch(() => {});
});

browser.runtime.onMessage.addListener((message) => {
  if (message && (message.type === "tab-failed" || message.type === "tab-first-only")) {
    window.postMessage({ source: "airsearch-extension", type: message.type, index: message.index }, "*");
  }
});
}
