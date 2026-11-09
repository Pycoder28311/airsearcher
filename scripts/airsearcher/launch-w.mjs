/*
 * npm run launch-w — the Windows version of `npm run launch`: starts Zen with
 * the AirSearch collector extension loaded, and the dev server, then opens the
 * dashboard.
 *
 *   1. Checks that Zen isn't already running (its profile can only be open once).
 *   2. Starts `npm run dev` unless the app already answers.
 *   3. Starts Zen on its own profile with the extension loaded, through
 *      `web-ext`, and opens the dashboard in it.
 *
 * Zen is found in its usual install folders, and its profile through
 * %APPDATA%\zen\profiles.ini. Another install: set ZEN_BIN to zen.exe and
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
import { backupDb, pullIfBehind } from "./launch-sync.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const extDir = process.env.AIRSEARCH_EXT_DIR || path.join(root, "scripts/airsearcher/collector-extension");
const port = process.env.PORT || "3000";
const appUrl = `http://localhost:${port}`;
const appData = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
const zenData = path.join(appData, "zen");

function fail(message) {
  console.error(`\nlaunch-w: ${message}\n`);
  process.exit(1);
}

if (process.platform !== "win32") {
  fail("This is the Windows launcher. On Linux/macOS use `npm run launch`.");
}

/** Quotes one argument for cmd.exe, so paths with spaces survive `shell: true`. */
const quote = (arg) => (/[\s"&|<>^()]/.test(arg) ? `"${arg.replace(/"/g, '\\"')}"` : arg);

/** Runs a command line through cmd.exe, each argument quoted. */
function run(command, args, options = {}) {
  return spawn([command, ...args].map(quote).join(" "), { shell: true, ...options });
}

/** The profile folder Zen's install uses: the "Install…" section's Default, else the profile marked Default=1. */
function defaultProfile() {
  const ini = path.join(zenData, "profiles.ini");
  if (!existsSync(ini)) return null;
  let section = "";
  let marked = null;
  let install = null;
  const paths = {};
  for (const line of readFileSync(ini, "utf8").split(/\r?\n/)) {
    const header = /^\[(.+)\]$/.exec(line);
    if (header) {
      section = header[1];
    } else if (section.startsWith("Install") && line.startsWith("Default=")) {
      install = line.slice(8);
    } else if (section.startsWith("Profile")) {
      if (line.startsWith("Path=")) paths[section] = line.slice(5);
      if (line === "Default=1") marked = section;
    }
  }
  const relative = install ?? (marked ? paths[marked] : null);
  return relative ? path.join(zenData, ...relative.split("/")) : null;
}

/** Zen's executable: ZEN_BIN, else the first usual install location that exists. */
function zenBinary() {
  if (process.env.ZEN_BIN) return process.env.ZEN_BIN;
  const candidates = [
    path.join(process.env.ProgramFiles || "C:\\Program Files", "Zen Browser", "zen.exe"),
    path.join(process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)", "Zen Browser", "zen.exe"),
    path.join(process.env.LOCALAPPDATA || "", "Programs", "Zen Browser", "zen.exe"),
    path.join(process.env.LOCALAPPDATA || "", "Zen Browser", "zen.exe"),
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

function zenRunning() {
  const result = spawnSync("tasklist", ["/FI", "IMAGENAME eq zen.exe", "/NH"], { encoding: "utf8" });
  return /zen\.exe/i.test(result.stdout || "");
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
/** Stops each child and what it started (npm → node, npx → web-ext → Zen), which `kill` alone leaves running. */
function stopAll() {
  for (const child of children) {
    if (child.pid) spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  }
}
process.on("SIGINT", () => (stopAll(), process.exit(0)));
process.on("SIGTERM", () => (stopAll(), process.exit(0)));

const profile = process.env.ZEN_PROFILE || defaultProfile();
if (!profile || !existsSync(profile)) fail("Couldn't find Zen's profile. Set ZEN_PROFILE to its folder.");
const zenBin = zenBinary();
if (!zenBin || !existsSync(zenBin)) fail("Couldn't find zen.exe. Set ZEN_BIN to its full path.");
if (!existsSync(extDir)) fail(`The extension folder is missing: ${extDir}`);
if (zenRunning()) {
  fail("Zen is running. Close it completely first (a profile can only be open once), then run this again.");
}

// Before anything starts: keep a copy of the database, then bring the code up to date.
await backupDb(root, (line) => console.log(`launch-w: ${line}`));
const changed = pullIfBehind(root, (line) => console.log(`launch-w: ${line}`));
if (changed.some((file) => file === "package.json" || file === "package-lock.json")) {
  console.log("launch-w: packages changed; installing…");
  // --ignore-scripts: better-sqlite3 ships its Windows binary, so nothing needs compiling.
  spawnSync([quote("npm"), "install", "--ignore-scripts"].join(" "), { cwd: root, stdio: "inherit", shell: true });
}
if (changed.some((file) => file.startsWith("prisma/"))) {
  spawnSync([quote("npx"), "prisma", "generate"].join(" "), { cwd: root, stdio: "inherit", shell: true });
}

if (await appUp()) {
  console.log(`launch-w: the app already answers on ${appUrl}; not starting another.`);
} else {
  console.log("launch-w: starting the dev server…");
  children.push(run("npm", ["run", "dev"], { cwd: root, stdio: "inherit" }));
  if (!(await waitForApp(90_000))) fail(`The app didn't come up on ${appUrl} within 90 s.`);
}

console.log("launch-w: starting Zen with the collector extension…");
const extra = (process.env.AIRSEARCH_ZEN_ARGS || "").split(" ").filter(Boolean).flatMap((arg) => ["--arg", arg]);
const webExt = run(
  "npx",
  [
    "--yes", "web-ext@10.7.0", "run",
    "--source-dir", extDir,
    "--firefox", zenBin,
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
  console.log(`\nlaunch-w: Zen closed (${code ?? "signal"}). The dev server keeps running; Ctrl+C stops it.`);
});
