/**
 * Builds curl's argument list from a prepared request.
 *
 * The arguments are rebuilt from the validated fields, never copied from the
 * pasted text, so nothing unchecked reaches curl. They are passed to the
 * process directly, never through a shell — which is also what makes this
 * behave the same on bash, zsh, cmd and PowerShell.
 */

import { CurlError } from "@/lib/airsearcher/curl/errors";
import type { PreparedCurl } from "@/lib/airsearcher/curl/validate";

/** Separates the response body from the status line curl appends after it. */
export const META_MARKER = "\n__AIRSEARCH_CURL_META__";

export function buildCurlArgs(
  request: PreparedCurl,
  options: { timeoutMs: number; maxBytes: number },
): string[] {
  const args = [
    "--silent",
    "--show-error",
    "--compressed",
    "--max-time",
    String(Math.ceil(options.timeoutMs / 1000)),
    "--max-filesize",
    String(options.maxBytes),
    "--request",
    request.method,
  ];

  for (const [name, value] of request.headers) {
    // A line break would let a header smuggle a second one in.
    if (/[\r\n]/.test(name) || /[\r\n]/.test(value)) {
      throw new CurlError("parse_error", "A header contains a line break.");
    }
    args.push("--header", `${name}: ${value}`);
  }

  if (request.body !== null) args.push("--data-raw", request.body);

  // curl expands \t itself; the marker's newline is literal.
  args.push("--write-out", `${META_MARKER}%{http_code}\\t%{content_type}\\t%{redirect_url}`);
  args.push("--url", request.url);
  return args;
}

export interface CurlOutput {
  body: string;
  httpStatus: number;
  contentType: string;
  redirectUrl: string;
}

/** Splits curl's stdout back into the body and the appended status line. */
export function splitCurlOutput(stdout: string): CurlOutput {
  const at = stdout.lastIndexOf(META_MARKER);
  if (at === -1) return { body: stdout, httpStatus: 0, contentType: "", redirectUrl: "" };
  const [status = "0", contentType = "", redirectUrl = ""] = stdout
    .slice(at + META_MARKER.length)
    .trim()
    .split("\t");
  return {
    body: stdout.slice(0, at),
    httpStatus: Number.parseInt(status, 10) || 0,
    contentType,
    redirectUrl,
  };
}

/**
 * The URL with its `_reqid` moved on by `step × (index + 1)`, as the browser
 * moves it for every new search. Unchanged when the URL has no `_reqid`.
 */
export function withRequestId(url: string, index: number, step: number): string {
  const parsed = new URL(url);
  const current = Number.parseInt(parsed.searchParams.get("_reqid") ?? "", 10);
  if (!Number.isFinite(current)) return url;
  parsed.searchParams.set("_reqid", String(current + step * (index + 1)));
  return parsed.toString();
}
