import { describe, expect, it } from "vitest";

import { verifyStagingSha } from "../../scripts/cloudflare/verify-staging-sha";

const sha = "a".repeat(40);

describe("production staging SHA verification", () => {
  it("accepts an exact SHA with a successful staging run and matching evidence", () => {
    expect(verifyStagingSha({
      requestedSha: sha,
      run: { headSha: sha, conclusion: "success", event: "push", headBranch: "main" },
      evidenceSha: `${sha}\n`,
    })).toEqual({ verified: true, commitSha: sha });
  });

  it.each([
    ["main", { headSha: sha, conclusion: "success", event: "push", headBranch: "main" }, sha, "invalid_commit_sha"],
    [sha, { headSha: sha, conclusion: "failure", event: "push", headBranch: "main" }, sha, "staging_run_not_successful"],
    [sha, { headSha: "b".repeat(40), conclusion: "success", event: "push", headBranch: "main" }, sha, "staging_run_sha_mismatch"],
    [sha, { headSha: sha, conclusion: "success", event: "push", headBranch: "feature" }, sha, "staging_run_not_main"],
    [sha, { headSha: sha, conclusion: "success", event: "push", headBranch: "main" }, "b".repeat(40), "staging_evidence_sha_mismatch"],
  ])("rejects invalid verification input %#", (requestedSha, run, evidenceSha, error) => {
    expect(() => verifyStagingSha({ requestedSha, run, evidenceSha })).toThrow(error);
  });
});
