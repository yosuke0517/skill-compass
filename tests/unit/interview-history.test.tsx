import { afterEach, it, expect, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { InterviewHistory } from "@/components/interview/interview-history";
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it("loads owner history on demand, evaluates and deletes without starting providers", async () => {
  const id = "e5bd4ec8-2480-4d69-b37a-2a2ed3f15da4",
    generationId = "d08fcbca-f9aa-4d17-9432-81404ccfd204";
  const fetcher = vi.fn(async (url: string) =>
    Response.json(
      url.endsWith("/list")
        ? [{ id, createdAt: 100000, expiresAt: 2592100000 }]
        : url.endsWith("/detail")
          ? {
              sessionId: id,
              offset: 0,
              turns: [{ text: "質問" }],
              generations: [
                {
                  id: generationId,
                  status: "success",
                  request: { model: "mock-no-provider" },
                  output: { lines: ["構成", "確認"] },
                  latencyMs: 10,
                  sentAt: 100000,
                  displayedAt: null,
                  rating: null,
                  comment: null,
                },
              ],
            }
          : { saved: true },
    ),
  );
  vi.stubGlobal("fetch", fetcher);
  vi.spyOn(window, "confirm").mockReturnValue(true);
  render(<InterviewHistory />);
  expect(fetcher).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText("履歴を読み込む・更新"));
  const item = await screen.findByText(/— 期限/);
  fireEvent.click(item);
  await screen.findByText(`セッション ${id}`);
  fireEvent.change(screen.getByLabelText("評価"), { target: { value: "helpful" } });
  fireEvent.change(screen.getByLabelText("改善メモ"), { target: { value: "具体的" } });
  fireEvent.click(screen.getByText("評価を保存"));
  await waitFor(() => expect(fetcher.mock.calls.some(([url]) => url.endsWith("/rate"))).toBe(true));
  await waitFor(() =>
    expect((screen.getByText("この履歴を削除") as HTMLButtonElement).disabled).toBe(false),
  );
  fireEvent.click(screen.getByText("この履歴を削除"));
  await waitFor(() => expect(screen.queryByText(`セッション ${id}`)).toBeNull());
  expect(
    fetcher.mock.calls.every(([url]) => url.startsWith("/api/admin/interview-learning/")),
  ).toBe(true);
});
