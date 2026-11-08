import { describe, expect, it } from "vitest";

import { randomBytes } from "node:crypto";

import {
  encodePlacementSecret,
  githubPlacementCommand,
  placeGeneratedSecret,
  workerPlacementCommand,
  type CommandResult,
  type VersionBase,
} from "../../scripts/oauth/place-generated-secret";

const entropy = Buffer.from("0123456789abcdef0123456789abcdef");
const versionBase: VersionBase = {
  deployedId: "1507690e",
  latestUploadId: "1507690e",
  expectedBaseId: "1507690e",
};

function trimmed(value: Buffer) {
  let end = value.length;
  while (end > 0 && value[end - 1]! <= 32) end -= 1;
  const nul = value.indexOf(0);
  const cut = nul === -1 ? end : Math.min(end, nul);
  return value.subarray(0, cut);
}

function quiet(status: number): CommandResult {
  return { status, stdout: "", stderr: "" };
}

describe("generated secret placement", () => {
  it("writes one value to GitHub and an undeployed Worker version without printing it", async () => {
    const calls: string[][] = [];
    const result = await placeGeneratedSecret({
      name: "OAUTH_TOKEN_ENCRYPTION_SECRET",
      generate: () => Buffer.from(entropy),
      versionBase,
      githubCommand: githubPlacementCommand("OAUTH_TOKEN_ENCRYPTION_SECRET"),
      workerCommand: workerPlacementCommand("OAUTH_TOKEN_ENCRYPTION_SECRET"),
      run: (command, stdin) => {
        calls.push(command);
        expect(stdin.equals(encodePlacementSecret(entropy))).toBe(true);
        expect(trimmed(stdin).equals(stdin)).toBe(true);
        return quiet(0);
      },
    });

    expect(result).toEqual({ ok: true, bytes: encodePlacementSecret(entropy).length });
    expect(calls[0]?.slice(0, 3)).toEqual(["gh", "secret", "set"]);
    expect(calls[1]?.slice(0, 6)).toEqual(["pnpm", "exec", "wrangler", "versions", "secret", "put"]);
    expect(JSON.stringify(result)).not.toContain(entropy.toString("utf8"));
  });

  it("keeps real entropy identical for both CLIs after trim and NUL cuts", async () => {
    const raw = Buffer.concat([randomBytes(15), Buffer.from([0, 0x20, 0x0a]), randomBytes(16)]);
    const seen: Buffer[] = [];
    const result = await placeGeneratedSecret({
      name: "OAUTH_TOKEN_ENCRYPTION_SECRET",
      generate: () => Buffer.from(raw),
      versionBase,
      githubCommand: githubPlacementCommand("OAUTH_TOKEN_ENCRYPTION_SECRET"),
      workerCommand: workerPlacementCommand("OAUTH_TOKEN_ENCRYPTION_SECRET"),
      run: (_command, stdin) => {
        seen.push(Buffer.from(stdin));
        return quiet(0);
      },
    });
    const encoded = encodePlacementSecret(raw);

    expect(raw.length).toBeGreaterThanOrEqual(32);
    expect(trimmed(raw).equals(raw)).toBe(false);
    expect(trimmed(encoded).equals(encoded)).toBe(true);
    expect(Buffer.from(encoded.toString("ascii"), "base64url").equals(raw)).toBe(true);
    expect(seen).toHaveLength(2);
    expect(seen[0]?.equals(seen[1] ?? Buffer.alloc(0))).toBe(true);
    expect(seen[0]?.equals(encoded)).toBe(true);
    expect(result.ok).toBe(true);
    expect(JSON.stringify(result)).not.toContain(encoded.toString("ascii"));
  });

  it("refuses a short value and a version that is not the deployed base", async () => {
    let called = false;
    const short = await placeGeneratedSecret({
      name: "OAUTH_TOKEN_ENCRYPTION_SECRET",
      generate: () => Buffer.alloc(31),
      versionBase,
      githubCommand: githubPlacementCommand("OAUTH_TOKEN_ENCRYPTION_SECRET"),
      workerCommand: workerPlacementCommand("OAUTH_TOKEN_ENCRYPTION_SECRET"),
      run: () => {
        called = true;
        return quiet(0);
      },
    });
    const mismatch = await placeGeneratedSecret({
      name: "OAUTH_TOKEN_ENCRYPTION_SECRET",
      generate: () => randomBytes(32),
      versionBase: { ...versionBase, latestUploadId: "93df164b" },
      githubCommand: githubPlacementCommand("OAUTH_TOKEN_ENCRYPTION_SECRET"),
      workerCommand: workerPlacementCommand("OAUTH_TOKEN_ENCRYPTION_SECRET"),
      run: () => {
        called = true;
        return quiet(0);
      },
    });

    expect(short).toEqual({ ok: false, reason: "placement_refused" });
    expect(mismatch).toEqual({ ok: false, reason: "version_base_mismatch" });
    expect(called).toBe(false);
  });

  it("stops after a GitHub failure and refuses an immediate wrangler secret put", async () => {
    let workerCalled = false;
    const failed = await placeGeneratedSecret({
      name: "SESSION_SECRET",
      generate: () => Buffer.from(entropy),
      versionBase,
      githubCommand: githubPlacementCommand("SESSION_SECRET"),
      workerCommand: workerPlacementCommand("SESSION_SECRET"),
      run: () => quiet(1),
    });
    const refused = await placeGeneratedSecret({
      name: "SESSION_SECRET",
      generate: () => Buffer.from(entropy),
      versionBase,
      githubCommand: ["gh", "secret", "set", "SESSION_SECRET"],
      workerCommand: ["wrangler", "secret", "put", "SESSION_SECRET"],
      run: () => {
        workerCalled = true;
        return quiet(0);
      },
    });

    expect(failed).toEqual({ ok: false, reason: "github_failed" });
    expect(refused).toEqual({ ok: false, reason: "placement_refused" });
    expect(workerCalled).toBe(false);
    expect(JSON.stringify(refused)).not.toContain(entropy.toString("utf8"));
  });

  it("does not return destination output when a command echoes the value", async () => {
    const echoed = await placeGeneratedSecret({
      name: "OAUTH_TOKEN_ENCRYPTION_SECRET",
      generate: () => Buffer.from(entropy),
      versionBase,
      githubCommand: githubPlacementCommand("OAUTH_TOKEN_ENCRYPTION_SECRET"),
      workerCommand: workerPlacementCommand("OAUTH_TOKEN_ENCRYPTION_SECRET"),
      run: (_command, stdin) => ({ status: 0, stdout: stdin.toString("utf8"), stderr: "" }),
    });

    expect(echoed).toEqual({ ok: false, reason: "destination_echoed" });
    expect(JSON.stringify(echoed)).not.toContain(encodePlacementSecret(entropy).toString("ascii"));
  });
});
