"use client";
import { useState } from "react";
type Entry = { id: string; createdAt: number; expiresAt: number };
type Generation = {
  id: string;
  status: string;
  request: unknown;
  output: unknown;
  latencyMs: number | null;
  sentAt: number | null;
  displayedAt: number | null;
  rating: string | null;
  comment: string | null;
};
type Detail = { sessionId: string; offset: number; turns: unknown[]; generations: Generation[] };
export function InterviewHistory() {
  const [entries, setEntries] = useState<Entry[]>([]),
    [detail, setDetail] = useState<Detail | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function api(operation: string, body: object = {}) {
    const r = await fetch(`/api/admin/interview-learning/${operation}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error ?? "履歴を取得できません。");
    return data;
  }
  async function action(work: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (e) {
      setError(e instanceof Error ? e.message : "操作に失敗しました。");
    } finally {
      setBusy(false);
    }
  }
  async function load(sessionId: string, offset = 0) {
    setDetail(await api("detail", { sessionId, offset }));
  }
  async function download() {
    if (!detail) return;
    const turns: unknown[] = [],
      generations: Generation[] = [];
    for (let offset = 0; offset <= 100000; offset += 10) {
      const page: Detail = await api("export", { sessionId: detail.sessionId, offset });
      turns.push(...page.turns);
      generations.push(...page.generations);
      if (page.turns.length < 10 && page.generations.length < 10) break;
      if (offset === 100000) throw new Error("履歴が大きすぎるため書き出せません。");
    }
    const url = URL.createObjectURL(
      new Blob(
        [
          JSON.stringify(
            { schemaVersion: 1, sessionId: detail.sessionId, turns, generations },
            null,
            2,
          ),
        ],
        { type: "application/json" },
      ),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `interview-${detail.sessionId}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <main className="mx-auto max-w-4xl space-y-6 p-6">
      <a href="/admin/interview">面接サポートへ戻る</a>
      <h1 className="text-2xl font-bold">保存した履歴と評価</h1>
      <p>
        保存を選んだセッションだけ表示します。音声は保存しません。開始から30日で閲覧できなくなり、定期処理で削除されます。基盤のバックアップは別の保持期間があります。
      </p>
      <p>
        生成成功・端末へ送信・画面反映は別々に記録します。画面反映は本人が読んだことの証明ではありません。書き出しは比較用で、モデルの再実行や追加課金は発生しません。
      </p>
      <button
        disabled={busy}
        onClick={() => void action(async () => setEntries(await api("list")))}
      >
        履歴を読み込む・更新
      </button>
      {error && <p role="alert">{error}</p>}
      <ul>
        {entries.map((e) => (
          <li key={e.id}>
            <button disabled={busy} onClick={() => void action(() => load(e.id))}>
              {new Date(e.createdAt).toLocaleString()} — 期限{" "}
              {new Date(e.expiresAt).toLocaleDateString()}
            </button>
          </li>
        ))}
      </ul>
      {detail && (
        <section className="space-y-4">
          <h2>セッション {detail.sessionId}</h2>
          <button disabled={busy} onClick={() => void action(download)}>
            全ページをJSONで書き出す
          </button>{" "}
          <button
            disabled={busy}
            onClick={() => {
              if (window.confirm("このセッションの保存済み文字・ヒント・評価を削除しますか？"))
                void action(async () => {
                  await api("delete", { sessionId: detail.sessionId });
                  setDetail(null);
                  setEntries(await api("list"));
                });
            }}
          >
            この履歴を削除
          </button>
          <h3>文字起こし</h3>
          <pre className="whitespace-pre-wrap break-words">
            {JSON.stringify(detail.turns, null, 2)}
          </pre>
          <h3>ヒントとモデル入力</h3>
          {detail.generations.map((g) => (
            <article className="space-y-2 rounded border p-4" key={g.id}>
              <p>
                {g.status} ／ {g.latencyMs ?? "未計測"} ms ／ 送信 {g.sentAt ? "済" : "未確認"} ／
                画面反映 {g.displayedAt ? "済" : "未確認"}
              </p>
              <pre className="whitespace-pre-wrap break-words">
                {JSON.stringify(g.output, null, 2)}
              </pre>
              <details>
                <summary>実際の入力・モデル・設定</summary>
                <pre className="whitespace-pre-wrap break-words">
                  {JSON.stringify(g.request, null, 2)}
                </pre>
              </details>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const data = new FormData(e.currentTarget);
                  void action(async () => {
                    await api("rate", {
                      sessionId: detail.sessionId,
                      generationId: g.id,
                      rating: data.get("rating"),
                      comment: data.get("comment"),
                    });
                    await load(detail.sessionId, detail.offset);
                  });
                }}
              >
                <label>
                  評価{" "}
                  <select name="rating" defaultValue={g.rating ?? "unrated"}>
                    <option value="unrated">未評価</option>
                    <option value="helpful">役立った</option>
                    <option value="unhelpful">改善が必要</option>
                    <option value="unsafe">不適切</option>
                  </select>
                </label>
                <label>
                  改善メモ{" "}
                  <textarea name="comment" maxLength={1000} defaultValue={g.comment ?? ""} />
                </label>
                <button disabled={busy}>評価を保存</button>
              </form>
            </article>
          ))}
          <button
            disabled={busy || detail.offset === 0}
            onClick={() =>
              void action(() => load(detail.sessionId, Math.max(0, detail.offset - 10)))
            }
          >
            前の10件
          </button>{" "}
          <button
            disabled={busy || (detail.turns.length < 10 && detail.generations.length < 10)}
            onClick={() => void action(() => load(detail.sessionId, detail.offset + 10))}
          >
            次の10件
          </button>
        </section>
      )}
    </main>
  );
}
