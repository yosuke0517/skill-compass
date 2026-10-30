// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ConfirmationError, confirmationLoop, displayReceipts } from "@/lib/interview/confirmation";
beforeEach(() =>
  vi.useFakeTimers({
    toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "performance"],
  }),
);
afterEach(() => vi.useRealTimers());
it("recovers a 503 without ending or overlapping pulses", async () => {
  const request = vi.fn().mockRejectedValueOnce(new ConfirmationError(503)).mockResolvedValue({});
  const failure = vi.fn(),
    success = vi.fn();
  const loop = confirmationLoop({ confirmedAt: performance.now(), request, failure, success });
  await vi.advanceTimersByTimeAsync(1000);
  expect(request).toHaveBeenCalledTimes(2);
  expect(success).toHaveBeenCalledTimes(1);
  expect(failure).not.toHaveBeenCalled();
  loop.stop();
});
it.each([403, 409, 410])("never retries denial %i", async (status) => {
  const request = vi.fn().mockRejectedValue(new ConfirmationError(status));
  const failure = vi.fn();
  confirmationLoop({ confirmedAt: performance.now(), request, failure, success: vi.fn() });
  await vi.advanceTimersByTimeAsync(5000);
  expect(request).toHaveBeenCalledTimes(1);
  expect(failure).toHaveBeenCalledWith(`HTTP_${status}`, true);
});
it("limits unavailable attempts to three", async () => {
  const request = vi.fn().mockRejectedValue(new ConfirmationError(503));
  const failure = vi.fn();
  confirmationLoop({ confirmedAt: 0, request, failure, success: vi.fn() });
  await vi.advanceTimersByTimeAsync(30000);
  expect(request).toHaveBeenCalledTimes(3);
  expect(failure).toHaveBeenCalledTimes(1);
});
it("expires at the existing deadline even if an in-flight operation ignores abort", async () => {
  let resolve!: (value: object) => void;
  const success = vi.fn(),
    failure = vi.fn();
  confirmationLoop({
    confirmedAt: -19000,
    request: () =>
      new Promise((r) => {
        resolve = r;
      }),
    success,
    failure,
  });
  await vi.advanceTimersByTimeAsync(1000);
  expect(failure).toHaveBeenCalledWith("CONFIRMATION_DEADLINE", false);
  resolve({});
  await vi.advanceTimersByTimeAsync(1);
  expect(success).not.toHaveBeenCalled();
});
it("retries visible receipts independently and deduplicates generations", async () => {
  const send = vi.fn().mockRejectedValueOnce(new ConfirmationError(503)).mockResolvedValue({});
  const failed = vi.fn();
  const queue = displayReceipts(send, failed);
  queue.add("s", "one");
  queue.add("s", "one");
  queue.add("s", "two");
  await vi.advanceTimersByTimeAsync(2000);
  queue.add("s", "one");
  expect(send).toHaveBeenCalledTimes(3);
  expect(failed).not.toHaveBeenCalled();
  queue.stop();
});
it("cancels pending receipt retries on disposal", async () => {
  const send = vi.fn().mockRejectedValue(new ConfirmationError(503));
  const queue = displayReceipts(send, vi.fn());
  queue.add("s", "one");
  await vi.advanceTimersByTimeAsync(1);
  queue.stop();
  await vi.advanceTimersByTimeAsync(5000);
  expect(send).toHaveBeenCalledTimes(1);
});
