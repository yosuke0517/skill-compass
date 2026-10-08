import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getCurrentUserById } from "@/lib/access/current-user";
import { InterviewRelayService } from "./relay-service";
import { RelayStore } from "./relay-store";
import { createRelayIdentityVerifier } from "./identity";
export function relaySettings() {
  const mode = process.env.INTERVIEW_RELAY_MODE;
  if (mode !== "mock" && mode !== "google") return null;
  const local = process.env.NODE_ENV === "development" && mode === "mock";
  if (mode === "mock" && !local) throw new Error("Mock relay is development-only");
  const url = new URL(process.env.INTERVIEW_RELAY_URL ?? "");
  const audience = new URL(process.env.INTERVIEW_RELAY_AUDIENCE ?? "");
  const subject = process.env.INTERVIEW_RELAY_SUBJECT ?? "";
  if (!/^\d{6,30}$/.test(subject)) throw new Error("Runtime subject is required");
  const valid = (u: URL, secure: string, plain: string) =>
    !u.username &&
    !u.password &&
    !u.search &&
    !u.hash &&
    (u.protocol === secure || (local && u.protocol === plain && u.hostname === "127.0.0.1"));
  if (
    !valid(url, "wss:", "ws:") ||
    !valid(audience, "https:", "http:") ||
    !audience.pathname.endsWith("/api/interview/relay/redeem")
  )
    throw new Error("Invalid relay endpoints");
  const keys = local ? JSON.parse(process.env.INTERVIEW_LOCAL_JWKS ?? "null") : undefined;
  if (local && !keys) throw new Error("Local identity keys required");
  return {
    mode: mode as "mock" | "google",
    url: url.href,
    audience: audience.href,
    subject,
    localKeys: keys,
  };
}
export async function relayRuntime() {
  const config = relaySettings();
  if (!config) return null;
  const { env } = await getCloudflareContext({ async: true });
  return {
    service: new InterviewRelayService(new RelayStore(env.DB), config, getCurrentUserById),
    verify: createRelayIdentityVerifier(config),
  };
}
