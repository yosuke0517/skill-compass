import type { CollectedSource } from "@/lib/podcast/content-collector";

export type PodcastScript = {
  language: "ja" | "en";
  speakers: Array<{ speaker: "host_a" | "host_b"; text: string }>;
};

export interface ScriptGenerator {
  generate(input: { language: "ja" | "en"; sources: CollectedSource[]; durationMinutes: number }): Promise<PodcastScript>;
}

export function createDeterministicScriptGenerator(): ScriptGenerator {
  return {
    async generate(input) {
      const sourceNames = input.sources.map((source) => source.title).join(", ");
      if (input.language === "en") {
        return {
          language: "en",
          speakers: [
            { speaker: "host_a", text: `Welcome to Skill Compass. Today we are reviewing ${sourceNames || "your engineering practice"}.` },
            { speaker: "host_b", text: "Use the source as a starting point, then verify the tradeoffs in your own system." },
          ],
        };
      }
      const topics = input.sources.length > 0 ? input.sources.map((source) => source.title) : ["今日のエンジニアリング学習"];
      const sections = [
        ["オープニング", "今日のテーマと、なぜ今この話をするのかを整理します。"],
        ["観察", "ソースに書かれている事実と、自分たちの解釈を分けて確認します。"],
        ["具体例", "実際の開発でこの考え方が登場する場面を、ブラウザ、API、データベースの順に考えます。"],
        ["トレードオフ", "便利になる部分だけでなく、運用コスト、書き込みコスト、複雑さも一緒に見ます。"],
        ["設計判断", "小さなプロジェクトと大きなサービスで、同じ答えにならない理由を比較します。"],
        ["失敗例", "用語だけを覚えた場合に起きる誤解と、検証可能な問いへの変え方を紹介します。"],
        ["実践", "今日の作業で試せる小さな変更と、その変更を確認するテストを決めます。"],
        ["振り返り", "明日もう一度確認するポイントと、関連する一次情報への戻り方をまとめます。"],
      ];
      const rounds = Math.max(1, Math.min(3, Math.ceil(input.durationMinutes / 4)));
      const hostA = [
        "まず、ここが少し気になりました。",
        "これ、実装するときに迷いやすいところですよね。",
        "いったん具体的な場面に置き換えてみましょう。",
        "ここで一つ、反対のケースも考えたいです。",
        "その判断をしたあと、何を観測すればよいでしょうか。",
      ];
      const hostB = [
        "賛成ですが、運用では別のコストも出そうです。",
        "そこは少し慎重に見たいです。小さいサービスなら別解もあります。",
        "たしかに。ただ、チームが増えると前提が変わりますね。",
        "その場合は、まず小さな検証をしてから決めるのがよさそうです。",
        "なるほど。最後に、自分のシステムでの判断基準に落とせそうです。",
      ];
      const speakers = Array.from({ length: rounds }, (_, round) => sections.flatMap(([section, guidance], index) => [
        { speaker: "host_a" as const, text: `${round > 0 ? `${round + 1}回目の視点です。` : ""}${section}。${hostA[index % hostA.length]} ${topics[index % topics.length]}を手がかりに、${guidance}` },
        { speaker: "host_b" as const, text: `${hostB[(index + round) % hostB.length]} ${topics[(index + 1) % topics.length]}と照らし合わせるなら、採用する条件と見送る条件を一つずつ言えそうです。` },
      ])).flat();
      return {
        language: "ja",
        speakers: [{ speaker: "host_a", text: `Skill Compass Podcastです。今日は${sourceNames || "エンジニアリングの学習"}を、少し肩の力を抜いて話していきます。` }, { speaker: "host_b", text: "聞くだけで終わらないように、最後は今日試せる小さな一歩まで決めましょう。" }, ...speakers, { speaker: "host_a", text: "ここまでの話を一言で言うと、正解を覚えるより、判断の理由を説明できるようにすることです。" }, { speaker: "host_b", text: "そして実際に試した結果が、次の問いを作ってくれます。それでは、また次回。" }],
      };
    },
  };
}
