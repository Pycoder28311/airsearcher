/**
 * The pacing gate every Google request passes through. Server-only.
 *
 * Requests run one at a time, and each waits until at least the minimum
 * interval (plus a random jitter) has passed since the previous one FINISHED —
 * so a slow answer never shortens the next gap. After a rate limit, the gate
 * refuses everything until the cool-down is over.
 *
 * The clock, sleep and randomness are injected so the gate can be checked
 * without ever contacting Google.
 */

import { CurlError } from "@/lib/airsearcher/curl/errors";

export interface GateOptions {
  minIntervalMs: number;
  jitterMs: number;
  coolDownMs: number;
  now: () => number;
  sleep: (ms: number, signal?: AbortSignal) => Promise<void>;
  random: () => number;
}

export interface Gate {
  run<T>(task: () => Promise<T>, signal?: AbortSignal): Promise<{ value: T; waitedMs: number }>;
  startCoolDown(): void;
  /** Milliseconds until requests are accepted again; 0 when not cooling down. */
  coolDownRemaining(): number;
}

function abortedError(): CurlError {
  return new CurlError("aborted", "The run was stopped.");
}

/** A setTimeout that an AbortSignal can cut short. */
export function abortableSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abortedError());
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortedError());
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export function createGate(options: GateOptions): Gate {
  let queue: Promise<void> = Promise.resolve();
  let lastFinishedAt: number | null = null;
  let coolDownUntil = 0;

  const coolDownRemaining = () => Math.max(0, coolDownUntil - options.now());

  const refuseIfCooling = () => {
    const remaining = coolDownRemaining();
    if (remaining > 0) {
      throw new CurlError(
        "cooling_down",
        `Paused after Google rate-limited a request. Try again in ${Math.ceil(remaining / 60_000)} min.`,
      );
    }
  };

  return {
    coolDownRemaining,

    startCoolDown() {
      coolDownUntil = options.now() + options.coolDownMs;
    },

    async run(task, signal) {
      const previous = queue;
      let release!: () => void;
      queue = new Promise((resolve) => (release = resolve));

      try {
        await previous;
        if (signal?.aborted) throw abortedError();
        refuseIfCooling();

        const startedWaiting = options.now();
        if (lastFinishedAt !== null) {
          const gap = options.minIntervalMs + Math.floor(options.random() * options.jitterMs);
          const wait = lastFinishedAt + gap - options.now();
          if (wait > 0) await options.sleep(wait, signal);
        }
        if (signal?.aborted) throw abortedError();
        // The cool-down may have started while this request was waiting.
        refuseIfCooling();
        const waitedMs = options.now() - startedWaiting;

        try {
          return { value: await task(), waitedMs };
        } finally {
          lastFinishedAt = options.now();
        }
      } finally {
        release();
      }
    },
  };
}
