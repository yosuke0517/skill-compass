import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { InterviewPanel } from "@/components/interview/interview-panel";
vi.mock("@/lib/interview/capture", () => ({ capture: vi.fn() }));
const json = (value: unknown) => new Response(JSON.stringify(value), { headers: { "content-type": "application/json" } });
beforeEach(() => { vi.stubGlobal("fetch", vi.fn(async () => json({ id: "test", expiresAt: Date.now() + 2_400_000 }))); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
describe("interview panel lifecycle", () => {
  it("does not start automatically and ignores repeated clicks while start is pending", async () => {
    let resolve!: (response: Response) => void;
    vi.mocked(fetch).mockReturnValueOnce(new Promise(r => { resolve = r; }));
    render(<InterviewPanel />); expect(fetch).not.toHaveBeenCalled();
    const start = screen.getByRole("button", { name: "開始" }); fireEvent.click(start); fireEvent.click(start);
    expect(fetch).toHaveBeenCalledTimes(1);
    resolve(json({ id: "test", expiresAt: Date.now() + 2_400_000 }));
    await screen.findByText("実行中", { exact: true });
  });
  it("stopping clears questions and discards a late hint reply", async () => {
    render(<InterviewPanel />); fireEvent.click(screen.getByRole("button", { name: "開始" }));
    await screen.findByText("実行中", { exact: true });
    let resolve!: (response: Response) => void;
    vi.mocked(fetch).mockReturnValueOnce(new Promise(r => { resolve = r; }));
    fireEvent.click(screen.getByRole("button", { name: "サンプル質問を送信" }));
    fireEvent.click(screen.getByRole("button", { name: "停止・表示を消去" }));
    resolve(json({ lines: ["遅れたヒント", "二行目", "三行目"] }));
    await waitFor(() => expect(screen.queryByText("遅れたヒント")).toBeNull());
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("");
  });
  it("shows a timeout and allows a manual reconnect without automatic capture", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new DOMException("timeout", "TimeoutError"));
    render(<InterviewPanel />);fireEvent.click(screen.getByRole("button", { name: "開始" }));
    await screen.findByText("一時停止", { exact: true });
    expect(screen.getByRole("alert").textContent).toContain("音声取得は停止しました");
    expect(fetch).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "再接続" }));
    await screen.findByText("実行中", { exact: true });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
