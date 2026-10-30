import { requireAdmin } from "@/lib/access/current-user";
import { InterviewPanel } from "@/components/interview/interview-panel";
import { relaySettings, relayRuntime } from "@/lib/interview/relay-runtime";
import { RelayInterviewPanel } from "@/components/interview/relay-interview-panel";
export default async function InterviewPage() {
  const user = await requireAdmin();
  const settings = relaySettings();
  let initialDuration: "trial" | "developer" = "trial";
  if (settings) {
    try {
      const runtime = await relayRuntime();
      const modes = (await runtime?.service.run("status", user, {})) as
        { trial: boolean; developer: boolean } | undefined;
      if (modes && !modes.trial && modes.developer) initialDuration = "developer";
    } catch {
      // The start endpoint reports a specific failure; do not grant or change any allowance here.
    }
  }
  return settings ? (
    <RelayInterviewPanel
      initialDuration={initialDuration}
      providerMode={settings.mode}
      learningEnabled={settings.learningEnabled}
    />
  ) : (
    <InterviewPanel />
  );
}
