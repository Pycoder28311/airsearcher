/*
 * The two things `npm run launch-w` does before it starts anything:
 *
 *   backupDb()     keeps a copy of the SQLite database (the saved searches),
 *                  so no launch, pull or update can cost the data.
 *   pullIfBehind() brings the branch up to date with GitHub when it is behind.
 *
 * Neither deletes anything of the user's. The pull is fast-forward only: it
 * never merges, resets, stashes or overwrites local changes; if it can't
 * fast-forward it says so and the app starts as it is.
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";

const BRANCH = "request-hybrid";
const KEEP_BACKUPS = 5;
const DEFAULT_DB = "data/airsearch.sqlite";

function git(root, args, timeout = 60_000) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8", timeout });
  return { ok: result.status === 0, out: (result.stdout || "").trim(), err: (result.stderr || "").trim() };
}

/** Copies the database to data/backups/, keeping the newest few. Never throws. */
export async function backupDb(root, log = console.log) {
  const file = path.resolve(root, process.env.AIRSEARCH_DB_PATH || DEFAULT_DB);
  if (!existsSync(file)) {
    log("sync: no database yet; nothing to back up.");
    return;
  }
  try {
    const { default: Database } = await import("better-sqlite3");
    const dir = path.join(path.dirname(file), "backups");
    mkdirSync(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
    const target = path.join(dir, `airsearch-${stamp}.sqlite`);
    // SQLite's own backup: a consistent copy even if the app has the file open.
    const db = new Database(file, { readonly: true, fileMustExist: true });
    try {
      await db.backup(target);
    } finally {
      db.close();
    }
    const old = readdirSync(dir)
      .filter((name) => /^airsearch-\d{8}-\d{6}\.sqlite$/.test(name))
      .sort()
      .slice(0, -KEEP_BACKUPS);
    for (const name of old) rmSync(path.join(dir, name), { force: true });
    log(`sync: database backed up to ${path.relative(root, target)} (last ${KEEP_BACKUPS} kept).`);
  } catch (error) {
    log(`sync: couldn't back up the database (${error instanceof Error ? error.message : error}); it was not touched.`);
  }
}

/**
 * Fast-forwards the branch to GitHub when GitHub has newer commits. Returns the
 * files the pull changed (empty when nothing was pulled), so the caller can
 * reinstall packages if they changed.
 */
export function pullIfBehind(root, log = console.log) {
  if (!git(root, ["rev-parse", "--is-inside-work-tree"]).ok) {
    log("sync: not a git folder; skipping the update check.");
    return [];
  }
  const current = git(root, ["rev-parse", "--abbrev-ref", "HEAD"]).out;
  if (current !== BRANCH) {
    log(`sync: on "${current}", not ${BRANCH}; skipping the update check.`);
    return [];
  }
  const fetched = git(root, ["fetch", "origin", BRANCH], 30_000);
  if (!fetched.ok) {
    log("sync: couldn't reach GitHub (offline, or not signed in); starting with what is here.");
    return [];
  }
  const behind = Number(git(root, ["rev-list", "--count", `HEAD..origin/${BRANCH}`]).out || 0);
  if (behind === 0) {
    log("sync: already up to date.");
    return [];
  }
  log(`sync: ${behind} new commit(s) on GitHub; pulling…`);
  const before = git(root, ["rev-parse", "HEAD"]).out;
  const pulled = git(root, ["pull", "--ff-only", "origin", BRANCH]);
  if (!pulled.ok) {
    const reason = pulled.err.split("\n").filter((line) => /^(error|fatal)/i.test(line))[0] || "see git's message above";
    log(`sync: couldn't pull (${reason}); starting with what is here.`);
    log("sync: your local changes were left alone. Commit or discard them, then run it again.");
    return [];
  }
  const changed = git(root, ["diff", "--name-only", before, "HEAD"]).out.split("\n").filter(Boolean);
  log(`sync: updated (${changed.length} file(s) changed).`);
  return changed;
}
