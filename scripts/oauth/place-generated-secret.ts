import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";

export const placementNames = ["OAUTH_TOKEN_ENCRYPTION_SECRET", "SESSION_SECRET"] as const;
export type PlacementName = (typeof placementNames)[number];
export type CommandResult = { status: number | null; stdout: string; stderr: string };
export type CommandRunner = (command: string[], stdin: Buffer) => Promise<CommandResult> | CommandResult;
export type PlacementResult =
  | { ok: true; bytes: number }
  | { ok: false; reason: "github_failed" | "worker_failed" | "destination_echoed" | "placement_refused" };

const immediateSecretPut = /(^|\s)secret\s+put(\s|$)/;
const versionedSecretPut = /(^|\s)versions\s+secret\s+put(\s|$)/;

export function assertPlacementCommand(command: string[]) {
  const line = command.join(" ");
  if (immediateSecretPut.test(line) && !versionedSecretPut.test(line)) {
    throw new Error("placement_refused");
  }
}

export async function placeGeneratedSecret(input: {
  name: PlacementName;
  run: CommandRunner;
  githubCommand: string[];
  workerCommand: string[];
  generate?: () => Buffer;
}): Promise<PlacementResult> {
  if (!placementNames.includes(input.name)) return { ok: false, reason: "placement_refused" };
  try {
    assertPlacementCommand(input.githubCommand);
    assertPlacementCommand(input.workerCommand);
  } catch {
    return { ok: false, reason: "placement_refused" };
  }
  const secret = Buffer.from(input.generate?.() ?? randomBytes(32));
  const bytes = secret.length;
  if (bytes < 32) return { ok: false, reason: "placement_refused" };
  const github = await input.run(input.githubCommand, secret);
  if (echoes(github, secret)) return { ok: false, reason: "destination_echoed" };
  if (github.status !== 0) return { ok: false, reason: "github_failed" };
  const worker = await input.run(input.workerCommand, secret);
  if (echoes(worker, secret)) return { ok: false, reason: "destination_echoed" };
  if (worker.status !== 0) return { ok: false, reason: "worker_failed" };
  secret.fill(0);
  return { ok: true, bytes };
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
  } else {
    void placeGeneratedSecret({
      name,
      run: captured,
      githubCommand: githubPlacementCommand(name),
      workerCommand: workerPlacementCommand(name),
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
