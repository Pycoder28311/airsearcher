/**
 * Turns a tokenized cURL command into a plain request description.
 *
 * Only the flags a browser's "Copy as cURL" produces are understood. Anything
 * else is refused by name. That is a safety rule, not an omission: flags such as
 * `-o`, `-K` or `--data @file` make curl write or read local files, and this
 * text runs on the user's own machine.
 */

import { CurlError } from "@/lib/airsearcher/curl/errors";
import { tokenizeCurl } from "@/lib/airsearcher/curl/tokenize";

export interface ParsedCurl {
  url: string;
  method: "GET" | "POST";
  /** In the order given, names as written. */
  headers: [name: string, value: string][];
  body: string | null;
}

const VALUE_FLAGS: Record<string, "method" | "header" | "data" | "data-raw" | "cookie" | "url"> = {
  "-X": "method",
  "--request": "method",
  "-H": "header",
  "--header": "header",
  "-d": "data",
  "--data": "data",
  "--data-ascii": "data",
  "--data-binary": "data",
  "--data-raw": "data-raw",
  "-b": "cookie",
  "--cookie": "cookie",
  "--url": "url",
};

/** Flags that are harmless and irrelevant: the runner sets its own. */
const IGNORED_FLAGS = new Set([
  "--compressed",
  "-s",
  "--silent",
  "-S",
  "--show-error",
  "--http1.1",
  "--http2",
  "--http3",
  "-g",
  "--globoff",
]);

/** Short flags that may carry their value glued on, e.g. `-XPOST`. */
const GLUED_SHORT = ["-X", "-H", "-d", "-b"];

function splitGlued(token: string): [string, string] | null {
  for (const flag of GLUED_SHORT) {
    if (token.startsWith(flag) && token.length > flag.length) {
      return [flag, token.slice(flag.length)];
    }
  }
  return null;
}

export function parseCurl(text: string): ParsedCurl {
  const tokens = tokenizeCurl(text).slice(1);

  let url: string | null = null;
  let method: string | null = null;
  const headers: [string, string][] = [];
  const data: string[] = [];
  const cookies: string[] = [];

  const setUrl = (value: string) => {
    if (url !== null) throw new CurlError("parse_error", "The command contains more than one URL.");
    url = value;
  };

  for (let i = 0; i < tokens.length; i++) {
    let flag = tokens[i];
    let value: string | undefined;

    const glued = flag.startsWith("--") ? null : splitGlued(flag);
    if (glued) [flag, value] = glued;

    if (!flag.startsWith("-")) {
      setUrl(flag);
      continue;
    }
    if (IGNORED_FLAGS.has(flag)) continue;

    const kind = VALUE_FLAGS[flag];
    if (!kind) {
      throw new CurlError(
        "flag_not_allowed",
        `The option “${flag}” isn't allowed. Only the options a browser's “Copy as cURL” produces are accepted.`,
      );
    }

    if (value === undefined) {
      value = tokens[++i];
      if (value === undefined) throw new CurlError("parse_error", `The option “${flag}” has no value.`);
    }

    switch (kind) {
      case "method":
        method = value.toUpperCase();
        break;
      case "header": {
        const colon = value.indexOf(":");
        if (colon <= 0) throw new CurlError("parse_error", "A header is missing its “Name: value” form.");
        headers.push([value.slice(0, colon).trim(), value.slice(colon + 1).trim()]);
        break;
      }
      case "data":
        // Everywhere except --data-raw, a leading @ means "read this file".
        if (value.startsWith("@")) {
          throw new CurlError("flag_not_allowed", "Request data read from a file (“@…”) isn't allowed.");
        }
        data.push(value);
        break;
      case "data-raw":
        data.push(value);
        break;
      case "cookie":
        // Without an "=" curl treats the value as a cookie file to read.
        if (!value.includes("=")) {
          throw new CurlError("flag_not_allowed", "Cookies read from a file aren't allowed.");
        }
        cookies.push(value);
        break;
      case "url":
        setUrl(value);
        break;
    }
  }

  if (url === null) throw new CurlError("parse_error", "The command has no URL.");

  if (cookies.length > 0) {
    const existing = headers.findIndex(([name]) => name.toLowerCase() === "cookie");
    if (existing === -1) headers.push(["Cookie", cookies.join("; ")]);
    else headers[existing] = [headers[existing][0], [headers[existing][1], ...cookies].join("; ")];
  }

  const body = data.length > 0 ? data.join("&") : null;
  const resolved = method ?? (body !== null ? "POST" : "GET");
  if (resolved !== "GET" && resolved !== "POST") {
    throw new CurlError("flag_not_allowed", `The ${resolved} method isn't allowed.`);
  }

  return { url, method: resolved, headers, body };
}
