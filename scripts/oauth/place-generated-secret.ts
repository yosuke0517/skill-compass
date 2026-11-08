import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";

export const placementNames = ["OAUTH_TOKEN_ENCRYPTION_SECRET", "SESSION_SECRET"] as const;
export type PlacementName = (typeof placementNames)[number];
export type CommandResult = { status: number | null; stdout: string; stderr: string };
export type CommandRunner = (command: string[], stdin: Buffer) => Promise<CommandResult> | CommandResult;
export type VersionBase = {
  deployedId: string;
  latestUploadId: string;
  expectedBaseId: string;
};

export type PlacementResult =
  | { ok: true; bytes: number }
  | { ok: false; reason: "github_failed" | "worker_failed" | "destination_echoed" | "placement_refused" | "version_base_mismatch" };

const immediateSecretPut = /(^|\s)secret\s+put(\s|$)/;
const versionedSecretPut = /(^|\s)versions\s+secret\s+put(\s|$)/;

export function assertPlacementCommand(command: string[]) {
  const line = command.join(" ");
  if (immediateSecretPut.test(line) && !versionedSecretPut.test(line)) {
    throw new Error("placement_refused");
  }
}

export function assertVersionBase(input: VersionBase) {
  const ids = [input.deployedId, input.latestUploadId, input.expectedBaseId];
  return ids.every((id) => id.length > 0) && input.deployedId === input.latestUploadId && input.deployedId === input.expectedBaseId;
}

export function encodePlacementSecret(entropy: Buffer) {
  if (entropy.length < 32) throw new Error("placement_refused");
  const encoded = Buffer.from(entropy.toString("base64url"), "ascii");
  const lossless = !encoded.includes(0)
    && encoded.every((byte) => byte > 32 && byte < 127)
    && Buffer.from(encoded.toString("ascii"), "base64url").equals(entropy);
  if (!lossless) throw new Error("placement_refused");
  return encoded;
}

export async function placeGeneratedSecret(input: {
  name: PlacementName;
  run: CommandRunner;
  githubCommand: string[];
  workerCommand: string[];
  versionBase: VersionBase;
  generate?: () => Buffer;
}): Promise<PlacementResult> {
  if (!placementNames.includes(input.name)) return { ok: false, reason: "placement_refused" };
  if (!assertVersionBase(input.versionBase)) return { ok: false, reason: "version_base_mismatch" };
  try {
    assertPlacementCommand(input.githubCommand);
    assertPlacementCommand(input.workerCommand);
  } catch {
    return { ok: false, reason: "placement_refused" };
  }
  const entropy = Buffer.from(input.generate?.() ?? randomBytes(32));
  let secret: Buffer;
  try {
    secret = encodePlacementSecret(entropy);
  } catch {
    entropy.fill(0);
    return { ok: false, reason: "placement_refused" };
  }
  const bytes = secret.length;
  const github = await input.run(input.githubCommand, secret);
  if (echoes(github, secret)) return finish(entropy, secret, { ok: false, reason: "destination_echoed" });
  if (github.status !== 0) return finish(entropy, secret, { ok: false, reason: "github_failed" });
  const worker = await input.run(input.workerCommand, secret);
  if (echoes(worker, secret)) return finish(entropy, secret, { ok: false, reason: "destination_echoed" });
  if (worker.status !== 0) return finish(entropy, secret, { ok: false, reason: "worker_failed" });
  return finish(entropy, secret, { ok: true, bytes });
}

function finish(entropy: Buffer, secret: Buffer, result: PlacementResult) {
  entropy.fill(0);
  secret.fill(0);
  return result;
}

export function githubPlacementCommand(name: PlacementName) {
  return ["gh", "secret", "set", name, "--repo", "yosuke0517/skill-compass"];
}

export function workerPlacementCommand(name: PlacementName) {
  return [
    "pnpm",
    "exec",
    "wrangler",
    "versions",
    "secret",
    "put",
    name,
    "--config",
    ".cloudflare/deploy-values.json",
    "--env",
    "production",
  ];
}

function echoes(result: CommandResult, secret: Buffer) {
  const text = `${result.stdout}\n${result.stderr}`;
  return text.includes(secret.toString("utf8")) || text.includes(secret.toString("base64url"));
}

function captured(command: string[], stdin: Buffer): CommandResult {
  const [bin, ...args] = command;
  const child = spawnSync(bin!, args, { input: stdin, encoding: "buffer" });
  return {
    status: child.status,
    stdout: Buffer.isBuffer(child.stdout) ? child.stdout.toString("utf8") : "",
    stderr: Buffer.isBuffer(child.stderr) ? child.stderr.toString("utf8") : "",
  };
}

if (process.argv[1]?.endsWith("place-generated-secret.ts")) {
  const name = process.argv[2];
  if (process.env.PLACEMENT_ACK !== "reviewed-freeze") {
    console.error("placement_locked");
    process.exitCode = 2;
  } else if (name !== "OAUTH_TOKEN_ENCRYPTION_SECRET" && name !== "SESSION_SECRET") {
    console.error("placement_usage");
    process.exitCode = 2;
  } else if (!process.argv[3] || !process.argv[4] || !process.argv[5]) {
    console.error("version_base_mismatch");
    process.exitCode = 2;
  } else {
    void placeGeneratedSecret({
      name,
      run: captured,
      githubCommand: githubPlacementCommand(name),
      workerCommand: workerPlacementCommand(name),
      versionBase: {
        deployedId: process.argv[3],
        latestUploadId: process.argv[4],
        expectedBaseId: process.argv[5],
      },
    }).then((result) => {
      if (!result.ok) {
        console.error(result.reason);
        process.exitCode = 1;
      } else {
        console.info("secret_placed", { name, bytes: result.bytes });
      }
    });
  }
}
