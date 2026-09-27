/**
 * Runs the curl binary. Server-only.
 *
 * `execFile` starts curl directly, with no shell in between: the arguments
 * reach curl exactly as built, whatever the OS and whatever characters the
 * cookies contain, and nothing in them can be interpreted as a command.
 * On Windows the binary is `curl.exe`, which also avoids PowerShell's legacy
 * `curl` alias for Invoke-WebRequest.
 */

import { execFile, type ExecFileException } from "node:child_process";
import { errorForExitCode } from "@/lib/airsearcher/curl/classify";
import { CurlError } from "@/lib/airsearcher/curl/errors";
import { splitCurlOutput, type CurlOutput } from "@/lib/airsearcher/curl/args";

const BINARY = process.platform === "win32" ? "curl.exe" : "curl";

function installHint(): string {
  switch (process.platform) {
    case "win32":
      return "Windows 10 (1803) and later include it as C:\\Windows\\System32\\curl.exe; on older versions install it from curl.se and add it to PATH.";
    case "darwin":
      return "macOS includes it; check PATH, or install it with “brew install curl”.";
    default:
      return "Install it with the package manager, e.g. “sudo apt install curl” or “sudo dnf install curl”.";
  }
}

function missingError(): CurlError {
  return new CurlError("curl_missing", `curl isn't installed or isn't on PATH. ${installHint()}`);
}

let available: Promise<void> | null = null;

/** Checks once that curl exists. A failed check is retried next time. */
export function ensureCurl(): Promise<void> {
  available ??= new Promise<void>((resolve, reject) => {
    execFile(BINARY, ["--version"], { windowsHide: true, timeout: 10_000 }, (error, stdout) => {
      if (error) {
        available = null;
        return reject(
          (error as NodeJS.ErrnoException).code === "ENOENT"
            ? missingError()
            : new CurlError("curl_missing", "curl is installed but couldn't be started."),
        );
      }
      const features = /Features:(.*)/.exec(stdout)?.[1] ?? "";
      const decoders = ["brotli", "zstd"].filter((name) => features.includes(name));
      console.info(
        `[airsearcher/curl] ${stdout.split("\n")[0]} — extra decoders: ${decoders.join(", ") || "none"}`,
      );
      resolve();
    });
  });
  return available;
}

function errorOf(error: ExecFileException): CurlError {
  if (error.code === "ENOENT") return missingError();
  if (error.name === "AbortError") return new CurlError("aborted", "The run was stopped.");
  if (error.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER") {
    return new CurlError("too_large", "The answer was larger than the allowed maximum.");
  }
  if (error.killed) return new CurlError("timeout", "Google didn't answer in time.");
  if (typeof error.code === "number") return errorForExitCode(error.code);
  return new CurlError("network", "curl failed to run.");
}

export async function runCurl(
  args: string[],
  options: { timeoutMs: number; maxBytes: number; signal?: AbortSignal },
): Promise<CurlOutput> {
  await ensureCurl();

  return new Promise((resolve, reject) => {
    execFile(
      BINARY,
      args,
      {
        shell: false,
        windowsHide: true,
        encoding: "utf8",
        // Room for the status line appended after the body.
        maxBuffer: options.maxBytes + 64 * 1024,
        // curl has its own --max-time; this only catches a hung process.
        timeout: options.timeoutMs + 5_000,
        signal: options.signal,
      },
      (error, stdout) => {
        if (error) return reject(errorOf(error));
        resolve(splitCurlOutput(stdout));
      },
    );
  });
}
