import { generateKeyPairSync } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
const directory = resolve(".private/interview");
mkdirSync(directory, { recursive: true });
const keyPath = directory + "/relay-test-key.pem";
const jwksPath = directory + "/relay-test-jwks.json";
if (!existsSync(keyPath) || !existsSync(jwksPath)) {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  writeFileSync(keyPath, privateKey.export({ type: "pkcs8", format: "pem" }), { mode: 0o600 });
  writeFileSync(
    jwksPath,
    JSON.stringify({
      keys: [
        {
          ...publicKey.export({ format: "jwk" }),
          kid: "local-interview-test",
          alg: "RS256",
          use: "sig",
        },
      ],
    }),
  );
}
const common = {
  INTERVIEW_RELAY_MODE: "mock",
  INTERVIEW_RELAY_AUDIENCE: "http://127.0.0.1:4320/api/interview/relay/redeem",
  INTERVIEW_RELAY_SUBJECT: "100000000000000000001",
};
let env = existsSync(".env.local") ? readFileSync(".env.local", "utf8") : "";
for (const [key, value] of Object.entries({
  ...common,
  INTERVIEW_RELAY_URL: "ws://127.0.0.1:4318/audio",
  INTERVIEW_LOCAL_JWKS: readFileSync(jwksPath, "utf8"),
})) {
  env = env.replace(new RegExp("^" + key + "=.*(?:\\n|$)", "gm"), "");
  env += "\n" + key + "='" + value + "'\n";
}
writeFileSync(".env.local", env, { mode: 0o600 });
writeFileSync(
  directory + "/relay.env",
  Object.entries({
    ...common,
    NODE_ENV: "development",
    INTERVIEW_BROWSER_ORIGIN: "http://127.0.0.1:4320",
    INTERVIEW_LOCAL_KEY_FILE: keyPath,
  })
    .map(([k, v]) => k + "=" + v)
    .join("\n"),
  { mode: 0o600 },
);
// Explicit fixture only. Never run this SQL against a remote database.
writeFileSync(
  directory + "/relay-local-budget.sql",
  "DELETE FROM interview_relay_sessions;\nINSERT INTO interview_relay_allowance VALUES(1,3900000,100) ON CONFLICT(id) DO UPDATE SET duration_remaining=3900000,hints_remaining=100;\n",
);
console.log(
  "Local test identity and loopback settings prepared. No cloud credentials or calls. Apply migration and fixture with wrangler --local only.",
);
