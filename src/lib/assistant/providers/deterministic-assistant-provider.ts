import type { AssistantProvider } from "../types";

export const deterministicAssistantProvider: AssistantProvider = {
  async ask(input) {
    return {
      status: "answered",
      answer: `今日は ${input.progress.answered}/${input.progress.total} 問まで進んでいます。気になる問題を1つ選んで、どの選択肢で迷ったかを言ってくれれば、ヒントから一緒に整理します。`,
      provider: "deterministic",
    };
  },
};
