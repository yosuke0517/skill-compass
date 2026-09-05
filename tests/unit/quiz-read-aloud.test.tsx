import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { QuizReadAloud } from "@/components/quiz/quiz-read-aloud";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
function setup() {
  const speak = vi.fn();
  const cancel = vi.fn();
  vi.stubGlobal("speechSynthesis", { speak, cancel });
  vi.stubGlobal("SpeechSynthesisUtterance", class {
    text: string;
    constructor(text: string) { this.text = text; }
  });
  return { speak, cancel };
}
it("reads only the requested text, uses the selected speed, and stops on unmount", () => {
  const { speak, cancel } = setup();
  const { unmount } = render(<QuizReadAloud question={["設問です", "Choice 1"]} />);
  expect(screen.queryByRole("button", { name: "解説を聞く" })).toBeNull();
  fireEvent.change(screen.getByLabelText("読み上げ速度"), { target: { value: "1.25" } });
  fireEvent.click(screen.getByRole("button", { name: "問題を聞く" }));
  expect(speak.mock.calls[0][0]).toMatchObject({ text: "設問です", lang: "ja-JP", rate: 1.25 });
  act(() => speak.mock.calls[0][0].onend());
  expect(speak.mock.calls[1][0]).toMatchObject({ text: "Choice 1", lang: "en-US" });
  unmount();
  expect(cancel).toHaveBeenCalled();
  act(() => speak.mock.calls[1][0].onend());
  expect(speak).toHaveBeenCalledTimes(2);
});
it("can switch to review and stop without a stale callback restarting speech", () => {
  const { speak } = setup();
  render(<QuizReadAloud question={["question", "next"]} review={["explanation"]} />);
  fireEvent.click(screen.getByRole("button", { name: "問題を聞く" }));
  const old = speak.mock.calls[0][0];
  fireEvent.click(screen.getByRole("button", { name: "解説を聞く" }));
  act(() => old.onend());
  expect(speak).toHaveBeenCalledTimes(2);
  expect(speak.mock.calls[1][0].text).toBe("explanation");
  fireEvent.click(screen.getByRole("button", { name: "停止" }));
  act(() => speak.mock.calls[1][0].onend());
  expect(speak).toHaveBeenCalledTimes(2);
});
it("explains unsupported browsers", () => {
  vi.stubGlobal("speechSynthesis", undefined);
  render(<QuizReadAloud question={["question"]} />);
  expect(screen.getByText("このブラウザでは読み上げを利用できません。")).toBeTruthy();
});
