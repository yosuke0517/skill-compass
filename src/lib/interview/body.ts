import { InterviewError } from "./mock-service";
export async function readInterviewJson(
  request: Request,
  limit = 8_192,
): Promise<Record<string, unknown>> {
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new InterviewError(415, "JSON形式が必要です。");
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    void reader?.cancel().catch(() => {});
  }, 5_000);
  try {
    if (reader)
      for (;;) {
        const part = await reader.read();
        if (part.done) break;
        size += part.value.byteLength;
        if (size > limit) {
          await reader.cancel();
          throw new InterviewError(413, "送信内容が大きすぎます。");
        }
        chunks.push(part.value);
      }
    if (timedOut) throw new InterviewError(408, "送信がタイムアウトしました。");
    const bytes = new Uint8Array(size);
    let at = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, at);
      at += chunk.length;
    }
    let input: unknown;
    try {
      input = JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      throw new InterviewError(400, "JSON形式を確認してください。");
    }
    if (!input || typeof input !== "object" || Array.isArray(input))
      throw new InterviewError(400, "入力が不正です。");
    return input as Record<string, unknown>;
  } finally {
    clearTimeout(timeout);
    reader?.releaseLock();
  }
}
