/*
 * AirSearch collector — Firefox / Zen.
 *
 * Watches the answer Google Flights sends to your own browser for each search
 * (GetShoppingResults) and passes a copy to the AirSearch app on this
 * computer. It reads the answer as it arrives; it sends nothing to Google and
 * does not change the page. The copy goes only to APP below, on localhost.
 * Only the search part of the request (f.req) is passed on, never its token.
 */

// The dev server's address. Change the port if the app runs on another one.
const APP = "http://localhost:3000/api/airsearcher/collect";

let sent = 0;

/**
 * Tells the app what the extension is doing; the app prints it in the
 * `npm run dev` terminal. This shows the same as the extension's console, but
 * where it can be read even when the browser's DevTools can't show it.
 */
const told = new Set();
function report(message, once) {
  if (once) {
    if (told.has(message)) return;
    told.add(message);
  }
  fetch(APP, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ debug: message }),
  }).catch(() => {});
}

function badge(text, color) {
  browser.browserAction.setBadgeText({ text });
  browser.browserAction.setBadgeBackgroundColor({ color });
}

/** The `f.req` form field of the request, from Firefox's parsed form or its raw bytes. */
function freqOf(details) {
  const body = details.requestBody;
  if (!body) return null;
  if (body.formData && body.formData["f.req"]) return body.formData["f.req"][0];
  if (body.raw && body.raw[0] && body.raw[0].bytes) {
    return new URLSearchParams(new TextDecoder().decode(body.raw[0].bytes)).get("f.req");
  }
  return null;
}

async function pass(freq, answer) {
  try {
    const response = await fetch(APP, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ request: "f.req=" + encodeURIComponent(freq), response: answer }),
    });
    if (!response.ok) throw new Error("HTTP " + response.status);
    sent += 1;
    badge(String(sent), "#15803d");
    return true;
  } catch (error) {
    console.warn("AirSearch collector: the app didn't take the answer.", error);
    badge("!", "#b91c1c");
    return false;
  }
}

browser.webRequest.onBeforeRequest.addListener(
  (details) => {
    // Logged so the extension's console (about:debugging → Inspect) shows what it sees.
    const rpc = details.url.split("?")[0].split("/").pop();
    console.log("AirSearch collector: saw", details.method, rpc, "tab", details.tabId);
    report("saw " + details.method + " " + rpc + " (tab " + details.tabId + ")", true);
    if (details.method !== "POST" || !details.url.includes("GetShoppingResults")) return;
    const freq = freqOf(details);
    if (!freq) {
      console.warn("AirSearch collector: no f.req in the request body.", Object.keys(details.requestBody || {}));
      report("GetShoppingResults without f.req; body keys: " + Object.keys(details.requestBody || {}).join(","));
      return;
    }
    console.log("AirSearch collector: catching a GetShoppingResults answer.");
    report("catching a GetShoppingResults answer");

    // Every piece goes on to the page untouched; this only keeps a copy.
    const filter = browser.webRequest.filterResponseData(details.requestId);
    const decoder = new TextDecoder("utf-8");
    let answer = "";
    filter.ondata = (event) => {
      answer += decoder.decode(event.data, { stream: true });
      filter.write(event.data);
    };
    filter.onstop = () => {
      answer += decoder.decode();
      filter.close();
      console.log("AirSearch collector: answer received,", answer.length, "characters; sending to the app.");
      pass(freq, answer).then((taken) => {
        // Announced for opener.js (optional); nothing happens if it isn't there.
        if (taken) document.dispatchEvent(new CustomEvent("airsearch-answer-sent", { detail: { tabId: details.tabId, freq } }));
      });
    };
    filter.onerror = () => {
      console.warn("AirSearch collector: the response filter failed:", filter.error);
      report("the response filter failed: " + filter.error);
      try {
        filter.disconnect();
      } catch (error) {
        // The page already has what it needs.
      }
    };
  },
  { urls: ["*://*/_/FlightsFrontendUi/*"] },
  ["blocking", "requestBody"],
);

report("extension started; waiting for Google Flights requests");
