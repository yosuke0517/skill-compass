import { InterviewError, InterviewMockService, assertInterviewAdmin, type InterviewUser } from "./mock-service";
const operations = new Set(["start", "stop", "reconnect", "pulse", "audio", "hint"]);
export function createInterviewHandler(deps: {
  user: () => Promise<InterviewUser | null>;
  enabled: () => boolean;
  service: InterviewMockService;
}) {
  return async (request: Request, operation: string): Promise<Response> => {
    const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { "Cache-Control": "no-store" } });
    try {
      const user = await deps.user(); // Always server session + fresh DB access; never a body role.
      assertInterviewAdmin(user);
      if (request.method !== "POST") return json({ error: "POSTのみ利用できます。" }, 405);
      const url = new URL(request.url);
      // Next dev normalizes request.url to localhost even when bound to 127.0.0.1.
      // Compare the actual Host, never a client-supplied forwarded-host header.
      const host = request.headers.get("host") ?? url.host;
      if (request.headers.get("origin") !== `${url.protocol}//${host}`) return json({ error: "送信元を確認できません。" }, 403);
      if (!deps.enabled()) return json({ error: "本接続は準備中です。ローカルのモックで確認してください。" }, 503);
      if (!operations.has(operation)) return json({ error: "操作が見つかりません。" }, 404);
      if (!request.headers.get("content-type")?.startsWith("application/json")) return json({ error: "JSON形式が必要です。" }, 415);
      // Limit the actual streamed body, including requests without Content-Length.
      const reader = request.body?.getReader();
      const chunks: Uint8Array[] = []; let length = 0;
      if (reader) {
        try {
          while (true) {
            const part = await reader.read(); if (part.done) break;
            length += part.value.byteLength;
            if (length > 8_192) { await reader.cancel(); return json({ error: "送信内容が大きすぎます。" }, 413); }
            chunks.push(part.value);
          }
        } finally { reader.releaseLock(); }
      }
      const bytes = new Uint8Array(length); let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      let input: unknown;
      try { input = JSON.parse(new TextDecoder().decode(bytes)); } catch { return json({ error: "JSON形式を確認してください。" }, 400); }
      if (!input || typeof input !== "object" || Array.isArray(input)) return json({ error: "入力が不正です。" }, 400);
      return json(deps.service.run(operation, user, input as Record<string, unknown>));
    } catch (error) {
      if (error instanceof InterviewError) return json({ error: error.message }, error.status);
      return json({ error: "接続を確認できません。停止して再試行してください。" }, 503);
    }
  };
}
