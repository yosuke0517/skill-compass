import { z } from "zod";
import { InterviewError } from "./mock-service";
import type { SqlDatabase } from "./relay-store";
const id = z.string().uuid();
const text = z.string().max(32000);
const recordSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("turn"), eventId: id, source: z.enum(["interviewer", "self"]), text }),
  z.object({
    kind: z.literal("request"),
    eventId: id,
    turnIds: z.array(id).max(6),
    request: z.object({
      model: z.string().max(100),
      promptVersion: z.string().max(100),
      body: z.object({
        systemInstruction: z.object({
          parts: z.array(z.object({ text: z.string().max(4096) })).max(1),
        }),
        contents: z
          .array(
            z.object({
              role: z.literal("user"),
              parts: z.array(z.object({ text: z.string().max(4096) })).max(1),
            }),
          )
          .max(1),
        generationConfig: z.object({
          temperature: z.number().min(0).max(2),
          maxOutputTokens: z.number().int().min(1).max(1024),
        }),
      }),
    }),
  }),
  z.object({
    kind: z.literal("result"),
    eventId: id,
    status: z.enum(["success", "error", "aborted"]),
    lines: z.array(z.string().max(60)).max(3),
    output: z.string().max(16000).optional(),
    errorCode: z.enum(["GENERATION_FAILED", "ABORTED", "TIMEOUT"]).nullable(),
    latencyMs: z.number().int().min(0).max(600000),
  }),
  z.object({ kind: z.literal("sent"), eventId: id }),
]);
export async function purgeInterviewLearning(db: SqlDatabase, now = Date.now()) {
  // Bounded batch; expired records are also excluded from every read/write immediately.
  await db
    .prepare(
      "DELETE FROM interview_learning_sessions WHERE id IN (SELECT id FROM interview_learning_sessions WHERE expires_at<=? LIMIT 100)",
    )
    .bind(now)
    .run();
}
export class LearningStore {
  constructor(
    private db: SqlDatabase,
    private now = Date.now,
  ) {}
  private async owned(sessionId: string, owner: string) {
    const row = await this.db
      .prepare(
        "SELECT id,ended_at,end_reason FROM interview_learning_sessions WHERE id=? AND owner=? AND expires_at>?",
      )
      .bind(sessionId, owner, this.now())
      .first<{ id: string; ended_at: number | null; end_reason: string | null }>();
    if (!row) throw new InterviewError(404, "保存された履歴が見つかりません。");
    return row;
  }
  async resumeContext(sessionId: string, owner: string) {
    await this.owned(sessionId, owner);
    const row = await this.db
      .prepare(
        "SELECT json_group_array(json_object('id',id,'source',source,'text',substr(text,-500))) AS data FROM (SELECT id,source,text FROM interview_learning_turns WHERE session_id=? ORDER BY created_at DESC,rowid DESC LIMIT 6)",
      )
      .bind(sessionId)
      .first<{ data: string }>();
    return (
      JSON.parse(row?.data ?? "[]") as {
        id: string;
        source: "interviewer" | "self";
        text: string;
      }[]
    ).reverse();
  }
  async record(sessionId: string, owner: string, value: unknown) {
    const parsed = recordSchema.safeParse(value);
    if (!parsed.success) throw new InterviewError(400, "学習ログの形式を確認できません。");
    const e = parsed.data;
    await this.owned(sessionId, owner);
    const now = this.now();
    // INSERT SELECT prevents late callbacks from resurrecting deleted/expired history.
    if (e.kind === "turn")
      await this.db
        .prepare(
          "INSERT OR IGNORE INTO interview_learning_turns(id,session_id,created_at,source,text) SELECT ?,id,?,?,? FROM interview_learning_sessions WHERE id=? AND owner=? AND expires_at>?",
        )
        .bind(e.eventId, now, e.source, e.text, sessionId, owner, now)
        .run();
    if (e.kind === "request")
      await this.db
        .prepare(
          "INSERT OR IGNORE INTO interview_learning_generations(id,session_id,created_at,turn_ids_json,request_json) SELECT ?,id,?,?,? FROM interview_learning_sessions WHERE id=? AND owner=? AND expires_at>?",
        )
        .bind(
          e.eventId,
          now,
          JSON.stringify(e.turnIds),
          JSON.stringify(e.request),
          sessionId,
          owner,
          now,
        )
        .run();
    if (e.kind === "result")
      await this.db
        .prepare(
          "UPDATE interview_learning_generations SET output_json=?,status=?,error_code=?,latency_ms=? WHERE id=? AND session_id=? AND status='pending' AND EXISTS(SELECT 1 FROM interview_learning_sessions WHERE id=? AND owner=? AND expires_at>?)",
        )
        .bind(
          JSON.stringify({ lines: e.lines, output: e.output ?? null }),
          e.status,
          e.errorCode,
          e.latencyMs,
          e.eventId,
          sessionId,
          sessionId,
          owner,
          now,
        )
        .run();
    if (e.kind === "sent")
      await this.db
        .prepare(
          "UPDATE interview_learning_generations SET sent_at=COALESCE(sent_at,?) WHERE id=? AND session_id=? AND status='success' AND EXISTS(SELECT 1 FROM interview_learning_sessions WHERE id=? AND owner=? AND expires_at>?)",
        )
        .bind(now, e.eventId, sessionId, sessionId, owner, now)
        .run();
    return { saved: true };
  }
  async run(operation: string, owner: string, input: Record<string, unknown>) {
    const now = this.now();
    if (operation === "list")
      return (
        (
          await this.db
            .prepare(
              "SELECT json_group_array(json_object('id',id,'createdAt',created_at,'expiresAt',expires_at)) AS data FROM (SELECT id,created_at,expires_at FROM interview_learning_sessions WHERE owner=? AND expires_at>? ORDER BY created_at DESC LIMIT 100)",
            )
            .bind(owner, now)
            .first<{ data: string }>()
        )?.data ?? "[]"
      );
    const sessionId = id.safeParse(input.sessionId);
    if (!sessionId.success) throw new InterviewError(400, "履歴IDが不正です。");
    const session = await this.owned(sessionId.data, owner);
    if (operation === "delete") {
      await this.db
        .prepare("DELETE FROM interview_learning_sessions WHERE id=? AND owner=?")
        .bind(sessionId.data, owner)
        .run();
      return { deleted: true };
    }
    if (operation === "detail" || operation === "export") {
      const offset = z
        .number()
        .int()
        .min(0)
        .max(100000)
        .safeParse(input.offset ?? 0);
      if (!offset.success) throw new InterviewError(400, "ページ指定が不正です。");
      const turns = await this.db
        .prepare(
          "SELECT json_group_array(json_object('id',id,'createdAt',created_at,'source',source,'text',text)) AS data FROM (SELECT * FROM interview_learning_turns WHERE session_id=? ORDER BY created_at,id LIMIT 10 OFFSET ?)",
        )
        .bind(sessionId.data, offset.data)
        .first<{ data: string }>();
      const generations = await this.db
        .prepare(
          "SELECT json_group_array(json_object('id',id,'createdAt',created_at,'turnIds',json(turn_ids_json),'request',json(request_json),'output',json(output_json),'status',status,'errorCode',error_code,'latencyMs',latency_ms,'sentAt',sent_at,'displayedAt',displayed_at,'rating',rating,'comment',comment)) AS data FROM (SELECT * FROM interview_learning_generations WHERE session_id=? ORDER BY created_at,id LIMIT 10 OFFSET ?)",
        )
        .bind(sessionId.data, offset.data)
        .first<{ data: string }>();
      return {
        schemaVersion: 1,
        offset: offset.data,
        pageSize: 10,
        sessionId: sessionId.data,
        endedAt: session.ended_at,
        endReason: session.end_reason,
        turns: JSON.parse(turns?.data ?? "[]"),
        generations: JSON.parse(generations?.data ?? "[]"),
      };
    }
    const generationId = id.safeParse(input.generationId);
    if (!generationId.success) throw new InterviewError(400, "生成IDが不正です。");
    if (operation === "displayed") {
      await this.db
        .prepare(
          "UPDATE interview_learning_generations SET displayed_at=COALESCE(displayed_at,?) WHERE id=? AND session_id=? AND status='success'",
        )
        .bind(now, generationId.data, sessionId.data)
        .run();
      return { saved: true };
    }
    if (operation === "rate") {
      const rating = z.enum(["helpful", "unhelpful", "unsafe", "unrated"]).safeParse(input.rating);
      if (!rating.success || typeof input.comment !== "string" || input.comment.length > 1000)
        throw new InterviewError(400, "評価を確認してください。");
      await this.db
        .prepare(
          "UPDATE interview_learning_generations SET rating=?,comment=?,evaluated_at=? WHERE id=? AND session_id=?",
        )
        .bind(rating.data, input.comment, now, generationId.data, sessionId.data)
        .run();
      return { saved: true };
    }
    throw new InterviewError(404, "操作が見つかりません。");
  }
}
