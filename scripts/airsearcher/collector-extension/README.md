# AirSearch collector (Firefox / Zen)

Lets the AirSearch app collect Google Flights answers from **your own browser**,
so the app makes no requests to Google itself.

## Install (temporary, until the browser restarts)

1. In Zen, open `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on…** and pick `manifest.json` in this folder.
3. The "AirSearch collector" button appears in the toolbar. Its badge counts the
   answers passed on (green number) or shows `!` when the app didn't take one.

Firefox removes a temporary add-on when the browser closes; load it again next
time. The app's address is the `APP` line at the top of `background.js` (port
3000 by default).

## Use

1. In the dashboard, switch the mode to **Mode: my browser** and press
   **Start collecting**.
2. For each row, click the arrow next to it (opens the search in this browser),
   wait for the flights, then click **View more flights**.
3. The row finishes by itself when the full list arrives. If a search has no
   "View more flights", the row offers **Use first page**.

The extension reads each answer as it arrives and sends a copy to
`http://localhost` only. It does not touch the page and sends nothing to Google.

## If Zen runs as a Flatpak

Choosing `manifest.json` in the file picker only gives Zen that one file, not
`background.js`, so the extension loads but never runs. Load the packaged
`scripts/airsearcher/airsearch-collector.xpi` instead (same **Load Temporary
Add-on…** button). Rebuild it after changing any file here:

```
python3 scripts/airsearcher/build-collector-xpi.py
```

## Tab opener (optional)

When you press **Start collecting**, the dashboard asks the extension to run
the searches one tab at a time: a Google Flights tab opens in front, Google's
**first page** of flights is caught and sent to the app, the tab closes, and
about 3 seconds later the next one opens: 3 s plus or minus up to 1 s,
drawn anew each time (`TAB_DELAY_MS` and `TAB_DELAY_JITTER_MS` in
`app/lib/airsearcher/collect/openTabs.ts`; set the jitter to 0 for a fixed wait). You click nothing. Only tabs the
extension opened are closed.

- By default only Google's **first page** is collected and nothing is clicked. It
  is shorter than the full list ("View more flights").
- **Full list:** tick *Click "View more flights" in each tab (full list)* next to
  the mode button in the dashboard. `view-more.js` then clicks the button in each
  tab, 1.5 s after it shows, and the tab closes once the full list is in
  (timeout 90 s, `FULL_TIMEOUT_MS`). If the tab has no such button (a short
  list has none): `view-more.js` reports it after 8 s (`NO_BUTTON_AFTER_MS`),
  and once the first page is in too, the first page is taken after a 3 s grace
  (`SETTLE_GRACE_MS`) without asking. If that report never comes, the first page
  is taken after 25 s (`FIRST_ONLY_AFTER_MS`).
  Without the box ticked, nothing is ever clicked.
- A tab that gives no answer in 45 s (`TAB_TIMEOUT_MS`), or that you close,
  marks its row as failed and the run goes on with the next search.
- **Stop** cancels the run and closes the tab being waited on.
- If the extension doesn't answer the dashboard, it says so and you open the
  links yourself. Reload the dashboard tab after loading the extension.

It only opens `https://www.google.com/travel/flights/search?…` links, at most
300 per run, and only when asked by a page on `localhost`.

**To remove it:** delete `opener.js` and `opener-relay.js`, remove `"opener.js"`
from `background.scripts` and the whole `"content_scripts"` block in
`manifest.json`, run the build command above and load the new `.xpi`. In the
app, delete `app/lib/airsearcher/collect/openTabs.ts` and the lines marked
`// tab opener` in `useCollectRun.ts`. (The one `document.dispatchEvent` line in
`background.js` can stay; it does nothing without `opener.js`.)

## Starting everything with one command

```
npm run launch
```

Starts the dev server (if the app isn't already up) and then Zen on its own
profile with this extension loaded (through `web-ext`), and opens the
dashboard. Code: `scripts/airsearcher/launch.mjs`.

- **Close Zen completely first.** A profile can only be open by one browser; the
  command stops with a message if Zen is running.
- It's for the Flatpak Zen. For another install, set `ZEN_BIN` (the binary) and
  `ZEN_PROFILE` (the profile folder).
- `web-ext` is fetched on first use through `npx`; it isn't added to the project.
- `web-ext` writes its remote-loading settings into the profile it starts, so
  the real Zen profile gets a few extra settings. They open nothing when Zen is
  started normally.
- Ctrl+C stops the dev server and Zen. Closing Zen leaves the dev server running.

## Click "View more flights" (optional, used by the full-list box)

`view-more.js` clicks "View more flights" in the tabs the opener opens, only
when the dashboard's full-list box is ticked. It does nothing on pages you
opened yourself. A click from a script is marked by the browser as not coming
from a person, and Google's page can see that.

**To remove it:** delete `view-more.js` and its entry in the `"content_scripts"`
block of `manifest.json`, run the build command above, and remove the checkbox
and the `fullList` argument in the app (`SessionCurlPanel.tsx`,
`useCollectRun.ts`, `openTabs.ts`). The `"should-click-more"` answer in
`opener.js` can stay.
