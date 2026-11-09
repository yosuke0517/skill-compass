import { describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { placeStoredSecret, placementNames } from "../../scripts/oauth/place-generated-secret";

const base = { deployedId: "version-a", latestUploadId: "version-a", expectedBaseId: "version-a" };
const dummy = Buffer.from("synthetic+test/value=with punctuation_012345");

describe("production secret placement", () => {
  it.each(placementNames)("pipes the exact saved %s to both production destinations", name => {
    const run = vi.fn((_command: string[], value: Buffer) => {
      expect(value.equals(dummy)).toBe(true);
      return 0;
    });
    expect(placeStoredSecret(name, dummy, base, run)).toBe("secret_placed");
    const commands = run.mock.calls.map(([command]) => command);
    expect(commands).toEqual([
      ["gh", "secret", "set", name, "--repo", "yosuke0517/skill-compass", "--env", "production"],
      ["pnpm", "exec", "wrangler", "versions", "secret", "put", name,
        "--config", ".cloudflare/deploy-values.json", "--env", "production"],
    ]);
  });
  it("refuses ambiguous input or a stale version before either write", () => {
    const run = vi.fn(() => 0);
    for (const value of [Buffer.alloc(0), Buffer.from("short"), Buffer.concat([dummy, Buffer.from("\n")]),
      Buffer.concat([dummy, Buffer.from([0])]), Buffer.from(" " + dummy), Buffer.alloc(5121, 65)]) {
      expect(placeStoredSecret("SESSION_SECRET", value, base, run)).toBe("placement_refused");
    }
    expect(placeStoredSecret("SESSION_SECRET", dummy, { ...base, latestUploadId: "other" }, run)).toBe("version_base_mismatch");
    expect(run).not.toHaveBeenCalled();
  });
  it("distinguishes first-write failure from a partial placement", () => {
    const first = vi.fn(() => 1);
    expect(placeStoredSecret("SESSION_SECRET", dummy, base, first)).toBe("github_failed");
    expect(first).toHaveBeenCalledTimes(1);
    const second = vi.fn().mockReturnValueOnce(0).mockReturnValueOnce(null);
    expect(placeStoredSecret("SESSION_SECRET", dummy, base, second)).toBe("worker_failed_after_github");
  });
  it("reads stdin and suppresses both child output streams even on partial failure", () => {
    const dir = mkdtempSync(join(tmpdir(), "oauth-placement-"));
    try {
      for (const [name, exit] of [["gh", 0], ["pnpm", 1]] as const) {
        writeFileSync(join(dir, name), `#!${process.execPath}\nconst value = require("node:fs").readFileSync(0); process.stdout.write(value); process.stderr.write(value); process.exitCode = value.equals(Buffer.from(${JSON.stringify(dummy.toString())})) ? ${exit} : 2;\n`, { mode: 0o700 });
      }
      const child = spawnSync(process.execPath, ["--import", "tsx", "scripts/oauth/place-generated-secret.ts",
        "SESSION_SECRET", "version-a", "version-a", "version-a"], {
        input: dummy, encoding: "utf8", env: { ...process.env, PATH: dir, PLACEMENT_ACK: "reviewed-freeze" },
      });
      expect(child.status).toBe(1);
      expect(child.stdout.trim()).toBe("worker_failed_after_github");
      expect(child.stderr).not.toContain(dummy.toString());
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
