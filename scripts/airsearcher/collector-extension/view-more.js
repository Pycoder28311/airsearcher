/*
 * OPTIONAL — clicks "View more flights" in the tabs the opener opens, when the
 * dashboard's "full list" box is ticked. Separate on purpose.
 *
 * It asks opener.js first, and does nothing in a tab you opened yourself or
 * when the box isn't ticked. In an opened tab it waits for the button, then
 * clicks it once, CLICK_DELAY_MS after it shows. A page with no such button
 * (a short list) isn't clicked; if none shows within NO_BUTTON_AFTER_MS it
 * tells opener.js, which then settles for the first page without asking.
 *
 * To remove it: delete this file and its entry in the "content_scripts" block
 * of manifest.json, rebuild the package (build-collector-xpi.py), and drop the
 * dashboard's checkbox. The "should-click-more" answer in opener.js is harmless.
 *
 * A click from a script is marked by the browser as not coming from a person,
 * and Google's page can see that.
 */

const CLICK_DELAY_MS = 1500;
const CHECK_EVERY_MS = 500;
const GIVE_UP_AFTER_MS = 60_000;
// No such button this long after the page opened: tell opener.js, which then takes the first page.
const NO_BUTTON_AFTER_MS = 8000;
const LABEL = /more flights/i;

function findButton() {
  for (const element of document.querySelectorAll('button, [role="button"]')) {
    const text = (element.getAttribute("aria-label") || "") + " " + (element.textContent || "");
    if (LABEL.test(text) && element.offsetParent !== null && !element.disabled) return element;
  }
  return null;
}

(async () => {
  let ours = false;
  try {
    const reply = await browser.runtime.sendMessage({ type: "should-click-more" });
    ours = Boolean(reply && reply.yes);
  } catch (error) {
    return;
  }
  if (!ours) return;

  const started = Date.now();
  let seenAt = null;
  let reported = false;
  const timer = setInterval(() => {
    if (Date.now() - started > GIVE_UP_AFTER_MS) return clearInterval(timer);
    const button = findButton();
    if (!button) {
      seenAt = null;
      if (!reported && Date.now() - started >= NO_BUTTON_AFTER_MS) {
        reported = true;
        browser.runtime.sendMessage({ type: "no-more-button" }).catch(() => {});
      }
      return;
    }
    seenAt = seenAt ?? Date.now();
    if (Date.now() - seenAt >= CLICK_DELAY_MS) {
      clearInterval(timer);
      button.click();
    }
  }, CHECK_EVERY_MS);
})();
