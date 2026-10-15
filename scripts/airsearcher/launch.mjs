/*
 * npm run launch — starts Zen with the AirSearch collector extension loaded,
 * and the dev server, then opens the dashboard.
 *
 *   1. Checks that Zen isn't already running (its profile can only be open once).
 *   2. Starts `npm run dev` unless the app already answers.
 *   3. Starts Zen on its own profile with the extension loaded, through
 *      `web-ext`, and opens the dashboard in it.
 *
 * Zen runs as a Flatpak here. Another install: set ZEN_BIN to its binary and
 * ZEN_PROFILE to the profile folder. Ctrl+C stops what this started.
 *
 * Tools: `web-ext` is fetched on first use (npx), not added to the project.
 * Note: web-ext writes its remote-loading settings into the profile it starts.
 */

import { spawn, spawnSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const extDir = process.env.AIRSEARCH_EXT_DIR || path.join(root, "scripts/airsearcher/collector-extension");
const port = process.env.PORT || "3000";
const appUrl = `http://localhost:${port}`;
const zenData = path.join(os.homedir(), ".var/app/app.zen_browser.zen/.zen");
const wrapper = path.join(root, "scripts/airsearcher/zen-flatpak.sh");

function fail(message) {
  console.error(`\nlaunch: ${message}\n`);
  process.exit(1);
}

/** The profile Zen's install uses: the "Install…" section's Default, else the profile marked Default=1. */
function defaultProfile() {
  const ini = path.join(zenData, "profiles.ini");
  if (!existsSync(ini)) return null;
  let section = "";
  let marked = null;
  let install = null;
  let pathOf = null;
  const paths = {};
  for (const line of readFileSync(ini, "utf8").split(/\r?\n/)) {
    const header = /^\[(.+)\]$/.exec(line);
    if (header) {
      section = header[1];
      pathOf = null;
    } else if (section.startsWith("Install") && line.startsWith("Default=")) {
      install = line.slice(8);
    } else if (section.startsWith("Profile")) {
      if (line.startsWith("Path=")) paths[section] = line.slice(5);
      if (line === "Default=1") marked = section;
    }
  }
  return install ?? (marked ? paths[marked] : null);
}

function zenRunning() {
  return spawnSync("pgrep", ["-f", "/app/zen/zen"]).status === 0;
}

function appUp() {
  return new Promise((resolve) => {
    const request = http.get(appUrl, { timeout: 2000 }, (response) => {
      response.resume();
      resolve(true);
    });
    request.on("error", () => resolve(false));
    request.on("timeout", () => (request.destroy(), resolve(false)));
  });
}

async function waitForApp(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await appUp()) return true;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return false;
}

const children = [];
function stopAll() {
  for (const child of children) child.kill("SIGTERM");
}
process.on("SIGINT", () => (stopAll(), process.exit(0)));
process.on("SIGTERM", () => (stopAll(), process.exit(0)));

const profile = process.env.ZEN_PROFILE || (defaultProfile() && path.join(zenData, defaultProfile()));
if (!profile || !existsSync(profile)) fail("Couldn't find Zen's profile. Set ZEN_PROFILE to its folder.");
if (!existsSync(extDir)) fail(`The extension folder is missing: ${extDir}`);
if (zenRunning()) {
  fail("Zen is running. Close it completely first (a profile can only be open once), then run this again.");
}

if (await appUp()) {
  console.log(`launch: the app already answers on ${appUrl}; not starting another.`);
} else {
  console.log("launch: starting the dev server…");
  children.push(spawn("npm", ["run", "dev"], { cwd: root, stdio: "inherit" }));
  if (!(await waitForApp(90_000))) fail(`The app didn't come up on ${appUrl} within 90 s.`);
}

console.log("launch: starting Zen with the collector extension…");
const extra = (process.env.AIRSEARCH_ZEN_ARGS || "").split(" ").filter(Boolean).flatMap((arg) => ["--arg", arg]);
const webExt = spawn(
  "npx",
  [
    "--yes", "web-ext@10.7.0", "run",
    "--source-dir", extDir,
    "--firefox", process.env.ZEN_BIN || wrapper,
    "--firefox-profile", profile,
    "--keep-profile-changes",
    "--start-url", appUrl,
    "--no-reload",
    "--no-input",
    ...extra,
  ],
  { cwd: root, stdio: "inherit", env: { ...process.env, AIRSEARCH_EXT_DIR: extDir } },
);
children.push(webExt);
webExt.on("exit", (code) => {
  console.log(`\nlaunch: Zen closed (${code ?? "signal"}). The dev server keeps running; Ctrl+C stops it.`);
});
