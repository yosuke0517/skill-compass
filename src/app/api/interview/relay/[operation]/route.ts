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
    const input = await readInterviewJson(request, 4_096);
    return json(await runtime.service.relay((await context.params).operation, input));
  } catch (e) {
    return json(
      { error: e instanceof InterviewError ? e.message : "中継接続を確認できません。" },
      e instanceof InterviewError ? e.status : 503,
    );
  }
}
