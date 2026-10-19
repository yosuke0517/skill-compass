import { requireAdmin } from "@/lib/access/current-user";
import { InterviewPanel } from "@/components/interview/interview-panel";
import { relaySettings } from "@/lib/interview/relay-runtime";
import { RelayInterviewPanel } from "@/components/interview/relay-interview-panel";
export default async function InterviewPage() {
  await requireAdmin();
  const settings = relaySettings();
  return settings ? (
    <RelayInterviewPanel providerMode={settings.mode} learningEnabled={settings.learningEnabled} />
  ) : (
    <InterviewPanel />
  );
}
