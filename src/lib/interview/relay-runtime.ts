import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getCurrentUserById } from "@/lib/access/current-user";
import { InterviewRelayService } from "./relay-service";
import { RelayStore } from "./relay-store";
import { createRelayIdentityVerifier } from "./identity";
import { LearningStore } from "./learning-store";
import { relaySettings } from "./relay-settings";
import { createCloudflareRelayService } from "./cloudflare-service";
import { InterviewError } from "./mock-service";
export { relaySettings } from "./relay-settings";
export async function relayRuntime() {
  const config = relaySettings();
  if (!config) return null;
  const { env } = await getCloudflareContext({ async: true });
  if (config.transport === "cloudflare") return {
    service: createCloudflareRelayService({ ...process.env, ...env }),
    verify: async (_request: Request) => {
      void _request;
      throw new InterviewError(401, "外部中継からのコールバックは無効です。");
    },
  };
  return {
    service: new InterviewRelayService(
      new RelayStore(env.DB),
      config,
      getCurrentUserById,
      new LearningStore(env.DB),
    ),
    verify: createRelayIdentityVerifier(config),
  };
}
