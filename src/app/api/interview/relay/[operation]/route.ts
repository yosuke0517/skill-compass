import { relayRuntime } from "@/lib/interview/relay-runtime";
import { readInterviewJson } from "@/lib/interview/body";
import { InterviewError } from "@/lib/interview/mock-service";
export async function POST(request: Request, context: { params: Promise<{ operation: string }> }) {
  const json = (value: unknown, status = 200) =>
    Response.json(value, { status, headers: { "Cache-Control": "no-store" } });
  try {
    const runtime = await relayRuntime();
    if (!runtime) return json({ error: "中継は無効です。" }, 503);
    await runtime.verify(request);
    const operation = (await context.params).operation;
    const input = await readInterviewJson(request, operation === "record" ? 131072 : 4_096);
    return json(await runtime.service.relay(operation, input));
  } catch (e) {
    return json(
      { error: e instanceof InterviewError ? e.message : "中継接続を確認できません。" },
      e instanceof InterviewError ? e.status : 503,
    );
  }
}
