export type RelayEnvironment = {
  NODE_ENV?: string;
  INTERVIEW_RELAY_TRANSPORT?: string;
  INTERVIEW_RELAY_MODE?: string;
  PUBLIC_APP_URL?: string;
  INTERVIEW_LEARNING_ENABLED?: string;
  INTERVIEW_OPENAI_HINT_MODEL?: string;
  INTERVIEW_RELAY_URL?: string;
  INTERVIEW_RELAY_AUDIENCE?: string;
  INTERVIEW_RELAY_SUBJECT?: string;
  INTERVIEW_LOCAL_JWKS?: string;
};

export function cloudflareRelaySettings(env: RelayEnvironment) {
  if (env.INTERVIEW_RELAY_TRANSPORT !== "cloudflare" || env.INTERVIEW_RELAY_MODE !== "openai")
    throw new Error("Cloudflare relay requires explicit OpenAI transport configuration");
  const app = new URL(env.PUBLIC_APP_URL ?? "");
  if (app.protocol !== "https:" || app.username || app.password || app.search || app.hash || app.pathname !== "/")
    throw new Error("Invalid public app origin");
  const model = env.INTERVIEW_OPENAI_HINT_MODEL ?? "gpt-4.1-mini";
  if (!/^[a-zA-Z0-9._-]+$/.test(model)) throw new Error("Invalid OpenAI hint model");
  return {
    transport: "cloudflare" as const,
    mode: "openai" as const,
    learningEnabled: env.INTERVIEW_LEARNING_ENABLED === "1",
    origin: app.origin,
    url: new URL("/api/interview/audio", app).href.replace(/^https:/, "wss:"),
    model,
  };
}

export function relaySettings(env: RelayEnvironment = process.env) {
  if (env.INTERVIEW_RELAY_TRANSPORT === "cloudflare") return cloudflareRelaySettings(env);
  if (env.INTERVIEW_RELAY_TRANSPORT && env.INTERVIEW_RELAY_TRANSPORT !== "external")
    throw new Error("Invalid relay transport");
  const mode = env.INTERVIEW_RELAY_MODE;
  if (mode !== "mock" && mode !== "google" && mode !== "openai") return null;
  const local = env.NODE_ENV === "development" && mode === "mock";
  if (mode === "mock" && !local) throw new Error("Mock relay is development-only");
  const url = new URL(env.INTERVIEW_RELAY_URL ?? "");
  const audience = new URL(env.INTERVIEW_RELAY_AUDIENCE ?? "");
  const subject = env.INTERVIEW_RELAY_SUBJECT ?? "";
  if (!/^\d{6,30}$/.test(subject)) throw new Error("Runtime subject is required");
  const valid = (u: URL, secure: string, plain: string) =>
    !u.username && !u.password && !u.search && !u.hash &&
    (u.protocol === secure || (local && u.protocol === plain && u.hostname === "127.0.0.1"));
  if (!valid(url, "wss:", "ws:") || !valid(audience, "https:", "http:") ||
    !audience.pathname.endsWith("/api/interview/relay/redeem"))
    throw new Error("Invalid relay endpoints");
  const keys = local ? JSON.parse(env.INTERVIEW_LOCAL_JWKS ?? "null") : undefined;
  if (local && !keys) throw new Error("Local identity keys required");
  return {
    transport: "external" as const,
    learningEnabled: env.INTERVIEW_LEARNING_ENABLED === "1",
    mode: mode as "mock" | "google" | "openai",
    url: url.href,
    audience: audience.href,
    subject,
    localKeys: keys,
  };
}
