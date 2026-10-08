import { requireAdmin } from "@/lib/access/current-user";
import { InterviewPanel } from "@/components/interview/interview-panel";
export default async function InterviewPage() {
  await requireAdmin();
  return <InterviewPanel />;
}
