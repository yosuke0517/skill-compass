import { generateKeyPairSync } from "node:crypto";
import { spawnSync } from "node:child_process";

// Run explicitly once per environment. No key values are printed or persisted locally.
const environment = process.argv[2];
if (environment !== "staging" && environment !== "production") {
  throw new Error("Usage: tsx scripts/cloudflare/provision-push-keys.ts staging|production");
}
const repo = "yosuke0517/skill-compass";
const existing = spawnSync(
  "gh",
  ["secret", "list", "--repo", repo, "--env", environment, "--json", "name"],
  { encoding: "utf8" },
);
if (existing.status !== 0)
  throw new Error("Could not inspect environment secret names. No key was generated.");
const names = JSON.parse(existing.stdout) as Array<{ name: string }>;
if (names.some(({ name }) => name === "VAPID_CONFIG")) {
  console.info(`VAPID_CONFIG already exists in ${environment}; unchanged.`);
} else {
  const { privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const jwk = privateKey.export({ format: "jwk" });
  const publicKey = Buffer.concat([
    Buffer.from([4]),
    Buffer.from(jwk.x!, "base64url"),
    Buffer.from(jwk.y!, "base64url"),
  ]).toString("base64url");
  const config = JSON.stringify({
    VAPID_PUBLIC_KEY: publicKey,
    VAPID_PRIVATE_KEY: jwk.d,
    VAPID_SUBJECT:
      environment === "production"
        ? "https://agent.finegate.xyz"
        : "https://skill-compass-cloudflare-staging.yosuke-takeuchi-dev.workers.dev",
  });
  const saved = spawnSync(
    "gh",
    ["secret", "set", "VAPID_CONFIG", "--repo", repo, "--env", environment],
    { input: config, stdio: ["pipe", "ignore", "ignore"] },
  );
  if (saved.status !== 0)
    throw new Error("Failed to save notification keys. No key values were logged.");
  console.info(`Created VAPID_CONFIG in ${environment}. Deploy this environment to use it.`);
}
