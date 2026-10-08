// @vitest-environment node
import { it, expect, vi } from "vitest";
import { readInterviewJson } from "@/lib/interview/body";
it("rejects an unfinished body on timeout even if its received prefix is valid JSON", async () => {
  vi.useFakeTimers();
  try {
    const body = new ReadableStream({
      start(c) {
        c.enqueue(new TextEncoder().encode("{}"));
      },
    });
    const req = new Request("https://app.example", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      duplex: "half",
    } as RequestInit);
    const result = expect(readInterviewJson(req)).rejects.toMatchObject({ status: 408 });
    await vi.advanceTimersByTimeAsync(5000);
    await result;
  } finally {
    vi.useRealTimers();
  }
});
