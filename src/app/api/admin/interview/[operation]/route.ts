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
export async function POST(request: Request, context: { params: Promise<{ operation: string }> }) {
  return handle(request, (await context.params).operation);
}
