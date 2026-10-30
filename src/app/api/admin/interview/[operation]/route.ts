import { getSession } from "@/lib/auth/session";
import { getCurrentUserById } from "@/lib/access/current-user";
import { createInterviewHandler } from "@/lib/interview/http";
import { InterviewMockService } from "@/lib/interview/mock-service";
const handle = createInterviewHandler({
  user: async () => {
    const session = await getSession();
    return session.authenticated && session.userId ? getCurrentUserById(session.userId) : null;
  },
  // This in-memory adapter must never run on distributed production Workers.
  enabled: () => process.env.NODE_ENV === "development" && process.env.INTERVIEW_LOCAL_MOCK === "1",
  service: new InterviewMockService(),
});
import { relayRuntime } from "@/lib/interview/relay-runtime";
export async function POST(request: Request, context: { params: Promise<{ operation: string }> }) {
  try {
    const runtime = await relayRuntime();
    if (runtime)
      return createInterviewHandler({
        user: async () => {
          const s = await getSession();
          return s.authenticated && s.userId ? getCurrentUserById(s.userId) : null;
        },
        enabled: () => true,
        service: runtime.service,
      })(request, (await context.params).operation);
    return handle(request, (await context.params).operation);
  } catch {
    return Response.json(
      { error: "中継設定を確認できません。", code: "RUNTIME_UNAVAILABLE" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
