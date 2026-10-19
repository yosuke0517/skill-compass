import { getSession } from "@/lib/auth/session";
import { getCurrentUserById } from "@/lib/access/current-user";
import { assertInterviewAdmin, InterviewError } from "@/lib/interview/mock-service";
import { readInterviewJson } from "@/lib/interview/body";
import { LearningStore } from "@/lib/interview/learning-store";
import { getCloudflareContext } from "@opennextjs/cloudflare";
export async function POST(request: Request, context: { params: Promise<{ operation: string }> }) {
  const json = (body: unknown, status = 200) =>
    Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
  let stage = "IDENTITY_LOOKUP_UNAVAILABLE";
  try {
    const session = await getSession();
    const user =
      session.authenticated && session.userId ? await getCurrentUserById(session.userId) : null;
    assertInterviewAdmin(user);
    const url = new URL(request.url);
    if (
      request.headers.get("origin") !==
      `${url.protocol}//${request.headers.get("host") ?? url.host}`
    )
      throw new InterviewError(403, "送信元を確認できません。");
    const input = await readInterviewJson(request, 8192);
    const { env } = await getCloudflareContext({ async: true });
    const operation = (await context.params).operation;
    stage = "LEARNING_DATABASE_UNAVAILABLE";
    const result = await new LearningStore(env.DB).run(operation, user.id, input);
    return json(operation === "list" ? JSON.parse(result as string) : result);
  } catch (e) {
    return json(
      {
        error: e instanceof InterviewError ? e.message : "履歴の操作を完了できません。",
        code: e instanceof InterviewError ? e.code : stage,
      },
      e instanceof InterviewError ? e.status : 503,
    );
  }
}
