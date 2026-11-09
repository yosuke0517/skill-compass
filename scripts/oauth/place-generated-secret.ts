import { spawnSync } from "node:child_process";

export const placementNames = ["OAUTH_TOKEN_ENCRYPTION_SECRET", "SESSION_SECRET"] as const;
type PlacementName = typeof placementNames[number];
type VersionBase = { deployedId: string; latestUploadId: string; expectedBaseId: string };
type Runner = (command: string[], value: Buffer) => number | null;
const maxBytes = 5 * 1024;

function validValue(value: Buffer) {
  if (value.length < 32 || value.length > maxBytes || value.includes(0)) return false;
  const text = value.toString("utf8");
  return !/[\r\n]/.test(text) && text.trim() === text && Buffer.from(text).equals(value);
}

export function placeStoredSecret(name: PlacementName, value: Buffer, base: VersionBase, run: Runner) {
  if (!base.expectedBaseId || base.deployedId !== base.expectedBaseId || base.latestUploadId !== base.expectedBaseId)
    return "version_base_mismatch";
  if (!placementNames.includes(name) || !validValue(value)) return "placement_refused";
  const github = ["gh", "secret", "set", name, "--repo", "yosuke0517/skill-compass", "--env", "production"];
  const worker = ["pnpm", "exec", "wrangler", "versions", "secret", "put", name,
    "--config", ".cloudflare/deploy-values.json", "--env", "production"];
  if (run(github, value) !== 0) return "github_failed";
  if (run(worker, value) !== 0) return "worker_failed_after_github";
  return "secret_placed";
}

async function readValue() {
  const chunks: Buffer[] = [];
  let bytes = 0;
  try {
    for await (const chunk of process.stdin) {
      const data: Buffer = chunk;
      chunks.push(data);
      bytes += data.length;
      if (bytes > maxBytes) throw new Error("placement_refused");
    }
    return Buffer.concat(chunks);
  } finally { for (const chunk of chunks) chunk.fill(0); }
}

function runQuietly([bin, ...args]: string[], value: Buffer) {
  return spawnSync(bin!, args, { input: value, stdio: ["pipe", "ignore", "ignore"] }).status;
}

async function main() {
  const [name, deployedId, latestUploadId, expectedBaseId] = process.argv.slice(2);
  if (process.env.PLACEMENT_ACK !== "reviewed-freeze" || process.stdin.isTTY ||
    !placementNames.includes(name as PlacementName) || !deployedId || !latestUploadId || !expectedBaseId)
    return "placement_refused";
  const value = await readValue();
  try {
    return placeStoredSecret(name as PlacementName, value, { deployedId, latestUploadId, expectedBaseId }, runQuietly);
  } finally { value.fill(0); }
}

if (process.argv[1]?.endsWith("place-generated-secret.ts")) {
  void main().catch(() => "placement_refused").then(status => {
    console.info(status);
    if (status !== "secret_placed") process.exitCode = 1;
  });
}
