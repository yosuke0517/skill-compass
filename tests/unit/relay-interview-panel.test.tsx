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
  it("renews the browser heartbeat while the relay is still cold-starting", async () => {
    vi.mocked(connectRelay).mockReturnValueOnce(new Promise(() => {}));
    render(<RelayInterviewPanel providerMode="mock" />);
    fireEvent.click(screen.getByText("開始", { exact: true }));
    await waitFor(() =>
      expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).endsWith("/pulse"))).toBe(
        true,
      ),
    );
    expect(screen.getByText("接続中", { exact: true })).toBeTruthy();
    fireEvent.click(screen.getByText("停止・表示を消去"));
    expect(vi.mocked(connectRelay).mock.calls[0][3].aborted).toBe(true);
  });

  it("uses the server-authorized initial mode and exposes a safe failure code", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      Response.json(
        { error: "通常利用枠が不足しています。", code: "STANDARD_ALLOWANCE_EXHAUSTED" },
        { status: 409 },
      ),
    );
    render(<RelayInterviewPanel providerMode="mock" initialDuration="developer" />);
    expect(screen.getByLabelText("利用時間")).toHaveProperty("value", "developer");
    fireEvent.click(screen.getByText("開始", { exact: true }));
    await screen.findByText("一時停止", { exact: true });
    expect(screen.getByRole("alert").textContent).toContain("STANDARD_ALLOWANCE_EXHAUSTED");
    expect(screen.getByRole("alert").textContent).toContain("利用時間を選び直せます");
    expect(connectRelay).not.toHaveBeenCalled();
  });

  it("starts with saving off and requires an explicit checkbox choice", async () => {
    render(<RelayInterviewPanel providerMode="mock" learningEnabled />);
    const checkbox = screen.getByRole("checkbox") as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
    fireEvent.click(checkbox);
    fireEvent.click(screen.getByText("開始", { exact: true }));
    await screen.findByText("実行中", { exact: true });
    expect(JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string).saveLearning).toBe(true);
    expect(checkbox.matches(":disabled")).toBe(true);
  });

  it("shows server-confirmed developer mode, elapsed time and generated hint count", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      Response.json({
        id: "session",
        ticket: "a".repeat(64),
        relayUrl: "ws://127.0.0.1:4318/audio",
        expiresAt: Date.now() + 2400000,
        startedAt: Date.now() - 65000,
        usageMode: "developer",
        hintAttempts: 3,
        hintLimit: null,
      }),
    );
    render(<RelayInterviewPanel providerMode="mock" />);
    fireEvent.change(screen.getByLabelText("利用時間"), { target: { value: "developer" } });
    expect(screen.getByLabelText("利用モードと使用状況").textContent).toContain(
      "開発者試験（開始前）",
    );
    fireEvent.click(screen.getByText("開始", { exact: true }));
    await screen.findByText("実行中", { exact: true });
    expect(JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string).duration).toBe(
      "developer",
    );
    expect(screen.getByLabelText("利用モードと使用状況").textContent).toContain(
      "本人限定・開発者試験",
    );
    expect(screen.getByLabelText("利用モードと使用状況").textContent).toContain("経過 1:05");
    expect(screen.getByLabelText("利用モードと使用状況").textContent).toContain("生成試行 3回");
    const args = vi.mocked(connectRelay).mock.calls[0];
    const { act } = await import("@testing-library/react");
    act(() => args[4]({ type: "hints", lines: ["状況を整理", "判断と結果を振り返る"] }));
    expect(screen.getByLabelText("利用モードと使用状況").textContent).toContain("ヒント表示 1回");
    fireEvent.click(screen.getByText("停止・表示を消去"));
    expect(transport.close).toHaveBeenCalled();
    expect(screen.queryByText("状況を整理")).toBeNull();
  });
  it("does not acquire audio or request a ticket until clicked; repeated clicks issue one ticket", async () => {
    let resolve!: (r: Response) => void;
    vi.mocked(fetch).mockReturnValueOnce(new Promise((r) => (resolve = r)));
    render(<RelayInterviewPanel providerMode="mock" />);
    expect(fetch).not.toHaveBeenCalled();
    expect(capture).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("開始", { exact: true }));
    fireEvent.click(screen.getByText("開始", { exact: true }));
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string).saveLearning).toBe(false);
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
