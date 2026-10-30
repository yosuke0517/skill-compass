import { requireAdmin } from "@/lib/access/current-user";
import { InterviewHistory } from "@/components/interview/interview-history";
export default async function Page() {
  await requireAdmin();
  return <InterviewHistory />;
}
