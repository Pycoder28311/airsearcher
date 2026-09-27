/**
 * Turns what curl reported into one typed outcome.
 *
 * Nothing here retries. A retry is another request to Google, and retrying is
 * exactly the behaviour that looks like a bot, so every failure is reported and
 * the user decides.
 */

import { CurlError, type CurlErrorCode } from "@/lib/airsearcher/curl/errors";
import type { CurlOutput } from "@/lib/airsearcher/curl/args";

/** curl's own exit codes that matter here. */
const EXIT_CODES: Record<number, [CurlErrorCode, string]> = {
  5: ["network", "Couldn't resolve the proxy. Check the network settings."],
  6: ["network", "Couldn't resolve www.google.com. Check the internet connection."],
  7: ["network", "Couldn't connect to www.google.com. Check the internet connection."],
  28: ["timeout", "Google didn't answer in time. Try this cURL again later."],
  35: ["network", "The secure connection to Google failed."],
  52: ["network", "Google closed the connection without an answer."],
  56: ["network", "The connection to Google broke while receiving the answer."],
  60: ["network", "Google's certificate couldn't be verified. Check the system clock and certificates."],
  61: ["unrecognised_response", "Google answered with an encoding this curl can't decode."],
  63: ["too_large", "The answer was larger than the allowed maximum."],
};

export function errorForExitCode(exitCode: number): CurlError {
  const known = EXIT_CODES[exitCode];
  if (known) return new CurlError(known[0], known[1]);
  return new CurlError("network", `curl failed (exit code ${exitCode}).`);
}

/** Captcha and "unusual traffic" pages are HTML, not the RPC format. */
function looksBlocked(output: CurlOutput): boolean {
  if (/\/sorry\//.test(output.redirectUrl)) return true;
  const head = output.body.slice(0, 20_000);
  return /unusual traffic|recaptcha|g-recaptcha|\/sorry\/index/i.test(head);
}

/**
 * Throws the typed error for a response that isn't usable. Returns normally
 * for a 2xx answer, which the parser then reads.
 */
export function checkResponse(output: CurlOutput): void {
  const status = output.httpStatus;

  if (status === 429 || looksBlocked(output)) {
    throw new CurlError(
      "rate_limited",
      "Google is rate-limiting or asking for a captcha. The runner pauses for a while; wait before trying again.",
    );
  }
  if (status === 401 || status === 403 || /accounts\.google\.com/.test(output.redirectUrl)) {
    throw new CurlError(
      "session_expired",
      "Google rejected the session. Copy fresh cURLs from the browser.",
    );
  }
  if (status === 0) {
    throw new CurlError("network", "curl didn't report an HTTP status.");
  }
  if (status < 200 || status >= 300) {
    throw new CurlError("http_error", `Google answered with HTTP ${status}.`);
  }
}
