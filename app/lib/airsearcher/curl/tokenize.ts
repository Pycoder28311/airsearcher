/**
 * Splits a pasted cURL command into its arguments, whatever shell it was
 * copied for.
 *
 * Browsers copy cURL in different dialects:
 *   POSIX — 'single', "double", $'ansi-c' quotes and `\` line continuations.
 *           Firefox/Chrome "Copy as cURL (POSIX)", the default on Linux/macOS.
 *   cmd   — "double" quotes with `^` escapes and `^` line continuations.
 *           "Copy as cURL (Windows)" / "(cmd)".
 *   PowerShell — not cURL at all (Invoke-WebRequest); rejected with a hint.
 *
 * The arguments are only ever parsed, never handed to a shell, so the dialect
 * matters for reading the text and nothing else.
 */

import { CurlError } from "@/lib/airsearcher/curl/errors";

export type CurlDialect = "posix" | "cmd";

export function detectDialect(text: string): CurlDialect {
  if (/Invoke-WebRequest|Invoke-RestMethod|New-Object\s+Microsoft\.PowerShell/i.test(text)) {
    throw new CurlError(
      "powershell",
      "This is the PowerShell format, which isn't supported. Use “Copy as cURL” instead.",
    );
  }
  return /\^"|\^\r?\n/.test(text) ? "cmd" : "posix";
}

const ANSI_C_ESCAPES: Record<string, string> = {
  n: "\n",
  t: "\t",
  r: "\r",
  "\\": "\\",
  "'": "'",
  '"': '"',
  a: "\x07",
  b: "\b",
  e: "\x1b",
  f: "\f",
  v: "\v",
  "?": "?",
};

/** Reads a POSIX $'…' string starting just after the opening quote. */
function readAnsiC(text: string, start: number): { value: string; end: number } {
  let value = "";
  let i = start;
  while (i < text.length) {
    const char = text[i];
    if (char === "'") return { value, end: i + 1 };
    if (char !== "\\") {
      value += char;
      i++;
      continue;
    }
    const next = text[i + 1];
    if (next === "x") {
      const hex = /^[0-9a-fA-F]{1,2}/.exec(text.slice(i + 2))?.[0] ?? "";
      value += hex ? String.fromCharCode(parseInt(hex, 16)) : "x";
      i += 2 + hex.length;
    } else if (next === "u" || next === "U") {
      const length = next === "u" ? 4 : 8;
      const hex = new RegExp(`^[0-9a-fA-F]{1,${length}}`).exec(text.slice(i + 2))?.[0] ?? "";
      value += hex ? String.fromCodePoint(parseInt(hex, 16)) : next;
      i += 2 + hex.length;
    } else if (next !== undefined && next in ANSI_C_ESCAPES) {
      value += ANSI_C_ESCAPES[next];
      i += 2;
    } else {
      value += `\\${next ?? ""}`;
      i += 2;
    }
  }
  throw new CurlError("parse_error", "A $'…' quoted value is never closed.");
}

function tokenizePosix(input: string): string[] {
  // A backslash before a newline joins the lines, as the shell would.
  const text = input.replace(/\\\r?\n/g, " ");
  const tokens: string[] = [];
  let current = "";
  let inToken = false;
  let i = 0;

  while (i < text.length) {
    const char = text[i];

    if (/\s/.test(char)) {
      if (inToken) tokens.push(current);
      current = "";
      inToken = false;
      i++;
      continue;
    }

    inToken = true;

    if (char === "'") {
      const end = text.indexOf("'", i + 1);
      if (end === -1) throw new CurlError("parse_error", "A '…' quoted value is never closed.");
      current += text.slice(i + 1, end);
      i = end + 1;
    } else if (char === "$" && text[i + 1] === "'") {
      const { value, end } = readAnsiC(text, i + 2);
      current += value;
      i = end;
    } else if (char === '"') {
      i++;
      let closed = false;
      while (i < text.length) {
        const inner = text[i];
        if (inner === '"') {
          closed = true;
          i++;
          break;
        }
        if (inner === "\\" && /["\\$`\n]/.test(text[i + 1] ?? "")) {
          if (text[i + 1] !== "\n") current += text[i + 1];
          i += 2;
          continue;
        }
        current += inner;
        i++;
      }
      if (!closed) throw new CurlError("parse_error", 'A "…" quoted value is never closed.');
    } else if (char === "\\") {
      current += text[i + 1] ?? "";
      i += 2;
    } else {
      current += char;
      i++;
    }
  }

  if (inToken) tokens.push(current);
  return tokens;
}

function tokenizeCmd(input: string): string[] {
  // `^` at a line end continues the command; any other `^X` is a literal X.
  const text = input.replace(/\^\r?\n/g, " ").replace(/\^([\s\S])/g, "$1");
  const tokens: string[] = [];
  let current = "";
  let inToken = false;
  let quoted = false;
  let i = 0;

  while (i < text.length) {
    const char = text[i];

    if (!quoted && /\s/.test(char)) {
      if (inToken) tokens.push(current);
      current = "";
      inToken = false;
      i++;
      continue;
    }

    inToken = true;

    if (char === "\\" && text[i + 1] === '"') {
      current += '"';
      i += 2;
    } else if (char === '"') {
      if (quoted && text[i + 1] === '"') {
        current += '"';
        i += 2;
      } else {
        quoted = !quoted;
        i++;
      }
    } else {
      current += char;
      i++;
    }
  }

  if (quoted) throw new CurlError("parse_error", 'A "…" quoted value is never closed.');
  if (inToken) tokens.push(current);
  return tokens;
}

/** The command's arguments, `curl` itself included as the first one. */
export function tokenizeCurl(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) throw new CurlError("empty", "Paste a cURL command first.");

  const dialect = detectDialect(trimmed);
  const tokens = dialect === "cmd" ? tokenizeCmd(trimmed) : tokenizePosix(trimmed);

  // A copied shell prompt ("$ curl …") is harmless; drop it.
  if (tokens[0] === "$") tokens.shift();
  const program = tokens[0]?.toLowerCase();
  if (program !== "curl" && program !== "curl.exe") {
    throw new CurlError("not_curl", "The command must start with “curl”.");
  }
  return tokens;
}
