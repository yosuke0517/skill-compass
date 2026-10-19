/** Only unavailable transport/upstream failures may be retried; never authorization/limits. */
export class ConfirmationError extends Error {
  constructor(
    public status: number,
    public code = `HTTP_${status}`,
  ) {
    super(code);
  }
  get transient() {
    return [502, 503, 504].includes(this.status);
  }
}
export function transient(error: unknown) {
  return error instanceof ConfirmationError
    ? error.transient
    : error instanceof TypeError || (error instanceof Error && error.name === "TimeoutError");
}
export function diagnostic(error: unknown) {
  return error instanceof ConfirmationError
    ? error.code
    : error instanceof Error && error.name === "TimeoutError"
      ? "TIMEOUT"
      : "NETWORK_ERROR";
}
export async function confirmRequest(url: string, body: object, signal: AbortSignal) {
  const response = await fetch(url, {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!response.ok) {
    // Preserve only bounded machine codes, never HTML/error bodies or identifiers.
    const value = await response.json().catch(() => ({}));
    const code =
      typeof value.code === "string" && /^[A-Z_0-9]{1,64}$/.test(value.code)
        ? value.code
        : `HTTP_${response.status}`;
    throw new ConfirmationError(response.status, code);
  }
  return response.json();
}
/** Single in-flight pulse; a failed pulse never advances the last-confirmed deadline. */
export function confirmationLoop(options: {
  confirmedAt: number;
  request: (signal: AbortSignal) => Promise<{ hintAttempts?: number }>;
  success: (value: { hintAttempts?: number }) => void;
  failure: (code: string, denied: boolean) => void;
}) {
  let confirmed = options.confirmedAt,
    pending = false,
    stopped = false,
    attempts = 0;
  let lastAttempt = -Infinity,
    retryAt = 0;
  let requestAbort: AbortController | undefined;
  const now = () => performance.now();
  const stop = () => {
    stopped = true;
    clearInterval(timer);
    requestAbort?.abort();
  };
  const fail = (code: string, denied = false) => {
    if (stopped) return;
    stop();
    options.failure(code, denied);
  };
  const pulse = () => {
    if (stopped) return;
    if (now() >= confirmed + 20000) {
      fail("CONFIRMATION_DEADLINE");
      return;
    }
    if (pending || now() < retryAt || (!attempts && now() - lastAttempt < 10000)) return;
    pending = true;
    lastAttempt = now();
    attempts++;
    const started = now();
    requestAbort = new AbortController();
    const timeout = setTimeout(
      () => requestAbort?.abort(new DOMException("Timed out", "TimeoutError")),
      Math.min(3000, confirmed + 20000 - now()),
    );
    void options
      .request(requestAbort.signal)
      .then((value) => {
        if (stopped) return;
        if (now() >= confirmed + 20000) {
          fail("CONFIRMATION_DEADLINE");
          return;
        }
        confirmed = started;
        attempts = 0;
        retryAt = 0;
        options.success(value);
      })
      .catch((error) => {
        if (stopped) return;
        if (!transient(error)) {
          fail(diagnostic(error), true);
          return;
        }
        if (attempts >= 3) {
          fail(diagnostic(error));
          return;
        }
        retryAt = now() + attempts * 500;
      })
      .finally(() => {
        clearTimeout(timeout);
        pending = false;
      });
  };
  const timer = setInterval(pulse, 250);
  pulse();
  return { pulse, stop };
}
/** A visible generation is queued once; replacing the displayed hint does not drop its receipt. */
export function displayReceipts(
  send: (sessionId: string, generationId: string, signal: AbortSignal) => Promise<unknown>,
  failed: () => void,
) {
  const pending = new Map<
    string,
    { abort: AbortController; timer?: ReturnType<typeof setTimeout> }
  >();
  const seen = new Set<string>();
  let stopped = false;
  return {
    add(sessionId: string, generationId: string) {
      const key = `${sessionId}:${generationId}`;
      if (stopped || seen.has(key)) return;
      if (pending.size >= 32 || seen.size >= 2000) {
        failed();
        return;
      }
      seen.add(key);
      const item = {
        abort: new AbortController(),
        timer: undefined as ReturnType<typeof setTimeout> | undefined,
      };
      pending.set(key, item);
      let attempts = 0;
      const run = async () => {
        attempts++;
        const timeout = setTimeout(
          () => item.abort.abort(new DOMException("Timed out", "TimeoutError")),
          3000,
        );
        try {
          await send(sessionId, generationId, item.abort.signal);
          pending.delete(key);
        } catch (error) {
          if (stopped) return;
          if (transient(error) && attempts < 3) {
            item.abort = new AbortController();
            item.timer = setTimeout(() => void run(), attempts * 500);
          } else {
            pending.delete(key);
            failed();
          }
        } finally {
          clearTimeout(timeout);
        }
      };
      void run();
    },
    stop() {
      stopped = true;
      for (const item of pending.values()) {
        clearTimeout(item.timer);
        item.abort.abort();
      }
      pending.clear();
      seen.clear();
    },
  };
}
