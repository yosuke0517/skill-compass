import { describe, expect, it } from "vitest";

import {
  githubPlacementCommand,
  placeGeneratedSecret,
  workerPlacementCommand,
  type CommandResult,
} from "../../scripts/oauth/place-generated-secret";

const secret = Buffer.from("0123456789abcdef0123456789abcdef");

function quiet(status: number): CommandResult {
  return { status, stdout: "", stderr: "" };
}

describe("generated secret placement", () => {
  it("writes one value to GitHub and an undeployed Worker version without printing it", async () => {
    const calls: string[][] = [];
    const result = await placeGeneratedSecret({
      name: "OAUTH_TOKEN_ENCRYPTION_SECRET",
      generate: () => Buffer.from(secret),
      githubCommand: githubPlacementCommand("OAUTH_TOKEN_ENCRYPTION_SECRET"),
      workerCommand: workerPlacementCommand("OAUTH_TOKEN_ENCRYPTION_SECRET"),
      run: (command, stdin) => {
        calls.push(command);
        expect(stdin.equals(secret)).toBe(true);
        return quiet(0);
      },
    });

    expect(result).toEqual({ ok: true, bytes: 32 });
    expect(calls[0]?.slice(0, 3)).toEqual(["gh", "secret", "set"]);
    expect(calls[1]?.slice(0, 6)).toEqual(["pnpm", "exec", "wrangler", "versions", "secret", "put"]);
    expect(JSON.stringify(result)).not.toContain(secret.toString("utf8"));
  });

  it("stops after a GitHub failure and refuses an immediate wrangler secret put", async () => {
    let workerCalled = false;
    const failed = await placeGeneratedSecret({
      name: "SESSION_SECRET",
      generate: () => Buffer.from(secret),
      githubCommand: githubPlacementCommand("SESSION_SECRET"),
      workerCommand: workerPlacementCommand("SESSION_SECRET"),
      run: () => quiet(1),
    });
    const refused = await placeGeneratedSecret({
      name: "SESSION_SECRET",
      generate: () => Buffer.from(secret),
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
    expect(JSON.stringify(refused)).not.toContain(secret.toString("utf8"));
  });

  it("does not return destination output when a command echoes the value", async () => {
    const echoed = await placeGeneratedSecret({
      name: "OAUTH_TOKEN_ENCRYPTION_SECRET",
      generate: () => Buffer.from(secret),
      githubCommand: githubPlacementCommand("OAUTH_TOKEN_ENCRYPTION_SECRET"),
      workerCommand: workerPlacementCommand("OAUTH_TOKEN_ENCRYPTION_SECRET"),
      run: () => ({ status: 0, stdout: secret.toString("utf8"), stderr: "" }),
    });

    expect(echoed).toEqual({ ok: false, reason: "destination_echoed" });
    expect(JSON.stringify(echoed)).not.toContain(secret.toString("utf8"));
  });
});
