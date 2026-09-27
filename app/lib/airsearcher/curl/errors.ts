/**
 * Every way a pasted cURL can fail, from parsing it to reading Google's answer.
 *
 * Messages describe the problem, never the input: a cURL carries the user's
 * Google session cookies, so none of it may be echoed back or logged.
 */

export type CurlErrorCode =
  | "empty"
  | "powershell"
  | "parse_error"
  | "not_curl"
  | "flag_not_allowed"
  | "url_not_allowed"
  | "rpc_not_supported"
  | "missing_body"
  | "round_trip"
  | "template_unrecognised"
  | "too_many"
  | "curl_missing"
  | "network"
  | "timeout"
  | "too_large"
  | "aborted"
  | "session_expired"
  | "rate_limited"
  | "cooling_down"
  | "http_error"
  | "unrecognised_response"
  | "not_available";

export interface CurlErrorInfo {
  code: CurlErrorCode;
  message: string;
  /** When true, the rest of the run is cancelled — carrying on would not help. */
  stopRun: boolean;
}

/** Codes where continuing with the next cURL is pointless or harmful. */
const STOPS_RUN: ReadonlySet<CurlErrorCode> = new Set([
  "curl_missing",
  "network",
  "session_expired",
  "rate_limited",
  "cooling_down",
  "not_available",
  "aborted",
]);

export class CurlError extends Error {
  constructor(
    readonly code: CurlErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "CurlError";
  }

  toInfo(): CurlErrorInfo {
    return { code: this.code, message: this.message, stopRun: STOPS_RUN.has(this.code) };
  }
}

export function errorInfo(code: CurlErrorCode, message: string): CurlErrorInfo {
  return new CurlError(code, message).toInfo();
}
