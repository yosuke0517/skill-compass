import { hasAdminAccess } from "@/lib/access/guards";
/** Local, single-process mock only. No transcript or audio persistence. */
export const INTERVIEW_DURATION_MS = 40 * 60_000;
export type InterviewUser = { id: string; role: string; entitlements: ReadonlySet<string> };
type Session = { id: string; owner: string; expiresAt: number; touched: number; hints: number; lastHint: number; sequence: number };
export class InterviewError extends Error {
  constructor(public status: number, message: string, public code?: string) { super(message); }
}
export function assertInterviewAdmin(user: InterviewUser | null): asserts user is InterviewUser {
  if (!user) throw new InterviewError(401, "ログインしてください。");
  if (!hasAdminAccess(user)) throw new InterviewError(403, "管理者のみ利用できます。");
}
export class InterviewMockService {
  private sessions = new Map<string, Session>();
  constructor(private now = Date.now) {}
  run(operation: string, user: InterviewUser | null, input: Record<string, unknown>) {
    assertInterviewAdmin(user);
    const now = this.now();
    for (const [id, value] of this.sessions) {
      if (now >= value.expiresAt || now - value.touched > 60_000) this.sessions.delete(id);
    }
    if (operation === "start") {
      // Repeated starts replace the same user's previous session, never duplicate it.
      for (const [id, value] of this.sessions) if (value.owner === user.id) this.sessions.delete(id);
      if (this.sessions.size >= 20) throw new InterviewError(429, "セッション数の上限です。");
      const session = { id: crypto.randomUUID(), owner: user.id, expiresAt: now + INTERVIEW_DURATION_MS, touched: now, hints: 0, lastHint: -Infinity, sequence: 0 };
      this.sessions.set(session.id, session);
      return { id: session.id, expiresAt: session.expiresAt, mode: "mock" };
    }
    const session = typeof input.id === "string" ? this.sessions.get(input.id) : undefined;
    if (!session || session.owner !== user.id) throw new InterviewError(410, "セッションが終了しました。開始し直してください。");
    session.touched = now;
    if (operation === "stop") { this.sessions.delete(session.id); return { stopped: true }; }
    if (operation === "reconnect" || operation === "pulse") return { expiresAt: session.expiresAt, sequence: session.sequence, mode: "mock" };
    if (operation === "audio") {
      if (input.source !== "interviewer" && input.source !== "self") throw new InterviewError(400, "音声入力元が不正です。");
      if (typeof input.sequence !== "number" || !Number.isSafeInteger(input.sequence) || input.sequence < 1) throw new InterviewError(400, "音声番号が不正です。");
      if (typeof input.pcm !== "string" || !/^[A-Za-z0-9+/]{4267}=$/.test(input.pcm)) throw new InterviewError(400, "音声形式が不正です。");
      if (input.sequence <= session.sequence) return { accepted: true, duplicate: true };
      if (input.sequence !== session.sequence + 1) throw new InterviewError(409, "音声の欠落を検出しました。開始し直してください。");
      session.sequence = input.sequence;
      // Validate and discard; this mock never pretends to recognize real audio.
      return { accepted: true, recognized: false };
    }
    if (operation === "hint") {
      if (typeof input.text !== "string" || !input.text.trim() || input.text.length > 500) throw new InterviewError(400, "質問は1〜500文字で入力してください。");
      if (session.hints >= 80 || now - session.lastHint < 2_500) throw new InterviewError(429, "ヒントの上限です。少し待ってください。");
      session.hints++; session.lastHint = now;
      const lines = /困難|失敗|課題/.test(input.text)
        ? ["実際に経験した場面を一つ選ぶ", "状況 → 自分の行動 → 結果の順に整理", "学んだこと・次に変えることを添える"]
        : ["質問が求める観点を確かめる", "結論 → 自分の具体例 → 学びの順に整理", "不明な条件は、答える前に確認する"];
      return { lines, mode: "mock" };
    }
    throw new InterviewError(404, "操作が見つかりません。");
  }
}
