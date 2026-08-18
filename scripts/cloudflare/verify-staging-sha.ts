import { readFileSync } from "node:fs";

type StagingRun = {
  headSha?: string;
  conclusion?: string;
  event?: string;
  headBranch?: string;
};

export function verifyStagingSha(input: {
  requestedSha: string;
  run: StagingRun;
  evidenceSha: string;
}) {
  const requestedSha = input.requestedSha.trim().toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(requestedSha)) throw new Error("invalid_commit_sha");
  if (input.run.conclusion !== "success") throw new Error("staging_run_not_successful");
  if (input.run.headBranch !== "main" || input.run.event !== "push") {
    throw new Error("staging_run_not_main");
  }
  if (input.run.headSha?.toLowerCase() !== requestedSha) {
    throw new Error("staging_run_sha_mismatch");
  }
  if (input.evidenceSha.trim().toLowerCase() !== requestedSha) {
    throw new Error("staging_evidence_sha_mismatch");
  }
  return { verified: true, commitSha: requestedSha };
}

function main() {
  const [requestedSha, runPath, evidencePath] = process.argv.slice(2);
  if (!requestedSha || !runPath || !evidencePath) {
    throw new Error("usage: verify-staging-sha <sha> <run.json> <commit-sha.txt>");
  }
  const run = JSON.parse(readFileSync(runPath, "utf8")) as StagingRun;
  const evidenceSha = readFileSync(evidencePath, "utf8");
  console.log(JSON.stringify(verifyStagingSha({ requestedSha, run, evidenceSha })));
}

if (process.argv[1]?.endsWith("verify-staging-sha.ts")) main();
