import { drizzle } from "drizzle-orm/d1";
import * as schema from "@/db/schema";
import { getCurrentUserFromDb } from "@/lib/access/current-user-data";
import { AuthorityError, type Authority, type Grant } from "../../../services/interview-relay/src/authority-core";
import { LearningStore } from "./learning-store";
import { InterviewError } from "./mock-service";
import { InterviewRelayService } from "./relay-service";
import { RelayStore } from "./relay-store";
import { cloudflareRelaySettings, type RelayEnvironment } from "./relay-settings";

export type CloudflareRelayEnvironment = RelayEnvironment & {
  DB: CloudflareEnv["DB"];
  OPENAI_API_KEY?: string;
};

export function requireCloudflareOpenAIKey(env: Pick<CloudflareRelayEnvironment, "OPENAI_API_KEY">) {
  if (!env.OPENAI_API_KEY?.trim())
    throw new InterviewError(503, "OPENAI_API_KEYをCloudflare WorkerのSecretに設定してください。", "OPENAI_KEY_UNAVAILABLE");
  return env.OPENAI_API_KEY;
}

export function createCloudflareRelayService(env: CloudflareRelayEnvironment) {
  const config = cloudflareRelaySettings(env);
  const db = drizzle(env.DB, { schema });
  return new InterviewRelayService(new RelayStore(env.DB), {
    ...config, beforeConnect: () => { requireCloudflareOpenAIKey(env); },
  },
    id => getCurrentUserFromDb(db, id), new LearningStore(env.DB));
}

/** Calls the existing authority in-process; never a public callback or signing key. */
export class DirectRelayAuthority implements Authority {
  constructor(private service: InterviewRelayService) {}
  async call(operation: Parameters<Authority["call"]>[0], input: object, signal: AbortSignal) {
    signal.throwIfAborted();
    try {
      // Do not throw after completion: a late successful redeem must reach the
      // state machine so it can release the now-cancelled one-use grant.
      return await this.service.relay(operation, input as Record<string, unknown>) as Grant;
    } catch (error) {
      if (error instanceof InterviewError) throw new AuthorityError(error.status);
      throw new AuthorityError(503);
    }
  }
}
