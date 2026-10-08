import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { RelayInterviewPanel } from "@/components/interview/relay-interview-panel";
import { capture } from "@/lib/interview/capture";
import { connectRelay, type RelayTransport } from "@/lib/interview/relay-client";
vi.mock("@/lib/interview/capture", () => ({ capture: vi.fn() }));
vi.mock("@/lib/interview/relay-client", () => ({ connectRelay: vi.fn() }));
let transport: RelayTransport;
beforeEach(() => {
  transport = { audio: vi.fn(), sample: vi.fn(), close: vi.fn() };
  vi.mocked(capture).mockResolvedValue({ close: vi.fn() });
  vi.mocked(connectRelay).mockResolvedValue(transport);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({
        id: "session",
        ticket: "a".repeat(64),
        relayUrl: "ws://127.0.0.1:4318/audio",
        expiresAt: Date.now() + 300000,
      }),
    ),
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});
describe("relay panel", () => {
  it("does not acquire audio or request a ticket until clicked; repeated clicks issue one ticket", async () => {
    let resolve!: (r: Response) => void;
    vi.mocked(fetch).mockReturnValueOnce(new Promise((r) => (resolve = r)));
    render(<RelayInterviewPanel providerMode="mock" />);
    expect(fetch).not.toHaveBeenCalled();
    expect(capture).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("開始", { exact: true }));
    fireEvent.click(screen.getByText("開始", { exact: true }));
    expect(fetch).toHaveBeenCalledTimes(1);
    resolve(
      Response.json({
        id: "session",
        ticket: "a".repeat(64),
        relayUrl: "ws://127.0.0.1:4318/audio",
        expiresAt: Date.now() + 300000,
      }),
    );
    await screen.findByText("実行中", { exact: true });
    expect(connectRelay).toHaveBeenCalledTimes(1);
  });
  it("captures only the interviewer and clears displays/late hints on stop", async () => {
    render(<RelayInterviewPanel providerMode="mock" />);
    fireEvent.change(screen.getByLabelText("面接官の音声", { exact: true }), {
      target: { value: "device" },
    });
    fireEvent.click(screen.getByText("開始", { exact: true }));
    await screen.findByText("実行中 · 音声取得中", { exact: true });
    expect(capture).toHaveBeenCalledTimes(1);
    expect(vi.mocked(capture).mock.calls[0][0]).toBe("interviewer");
    const args = vi.mocked(connectRelay).mock.calls[0];
    fireEvent.click(screen.getByText("停止・表示を消去"));
    expect(args[3].aborted).toBe(true);
    args[4]({ type: "hints", lines: ["遅い回答", "消す"] });
    await waitFor(() => expect(screen.queryByText("遅い回答")).toBeNull());
    expect(screen.getByRole("textbox")).toHaveProperty("value", "");
    expect(transport.close).toHaveBeenCalled();
  });
  it("releases a late start reply after stopping and never opens its socket", async () => {
    let resolve!: (r: Response) => void;
    vi.mocked(fetch).mockReturnValueOnce(new Promise((r) => (resolve = r)));
    render(<RelayInterviewPanel providerMode="mock" />);
    fireEvent.click(screen.getByText("開始", { exact: true }));
    fireEvent.click(screen.getByText("停止・表示を消去"));
    resolve(
      Response.json({
        id: "late",
        expiresAt: Date.now() + 300000,
        ticket: "x",
        relayUrl: "ws://127.0.0.1",
      }),
    );
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(vi.mocked(fetch).mock.calls[1][0]).toContain("/stop");
    expect(connectRelay).not.toHaveBeenCalled();
  });
  it("permission failure allocates no paid session and permits manual retry", async () => {
    vi.mocked(capture).mockRejectedValueOnce(new Error("permission denied"));
    render(<RelayInterviewPanel providerMode="google" />);
    fireEvent.click(screen.getByText("開始", { exact: true }));
    await screen.findByText("一時停止", { exact: true });
    expect(fetch).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toContain("permission denied");
  });
});
