import { readInterviewJson } from "./body";
import {
  InterviewError,
  InterviewMockService,
  assertInterviewAdmin,
  type InterviewUser,
} from "./mock-service";
const operations = new Set(["start", "stop", "reconnect", "pulse", "audio", "hint", "status"]);
export function createInterviewHandler(deps: {
  user: () => Promise<InterviewUser | null>;
  enabled: () => boolean;
  service:
    | Pick<InterviewMockService, "run">
    | {
        run(
          operation: string,
          user: InterviewUser,
          input: Record<string, unknown>,
        ): Promise<unknown>;
      };
}) {
  return async (request: Request, operation: string): Promise<Response> => {
    const json = (value: unknown, status = 200) =>
      Response.json(value, { status, headers: { "Cache-Control": "no-store" } });
    let stage = "IDENTITY_LOOKUP_UNAVAILABLE";
    try {
      const user = await deps.user(); // Always server session + fresh DB access; never a body role.
      assertInterviewAdmin(user);
      if (request.method !== "POST") return json({ error: "POSTのみ利用できます。" }, 405);
      const url = new URL(request.url);
      // Next dev normalizes request.url to localhost even when bound to 127.0.0.1.
      // Compare the actual Host, never a client-supplied forwarded-host header.
      const host = request.headers.get("host") ?? url.host;
      if (request.headers.get("origin") !== `${url.protocol}//${host}`)
        return json({ error: "送信元を確認できません。" }, 403);
      if (!deps.enabled())
        return json({ error: "本接続は準備中です。ローカルのモックで確認してください。" }, 503);
      if (!operations.has(operation)) return json({ error: "操作が見つかりません。" }, 404);
      const input = await readInterviewJson(request);
      stage = "CONFIRMATION_DATABASE_UNAVAILABLE";
      return json(await deps.service.run(operation, user, input as Record<string, unknown>));
    } catch (error) {
      if (error instanceof InterviewError)
        return json(
          { error: error.message, ...(error.code ? { code: error.code } : {}) },
          error.status,
        );
      return json(
        { error: "接続を確認できません。停止して再試行してください。", code: stage },
        503,
      );
    }
  };
}
