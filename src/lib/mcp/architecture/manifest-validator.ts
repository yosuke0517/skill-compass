import { z } from "zod";

import {
  claimStatuses,
  type ArchitectureManifest,
} from "@/lib/mcp/architecture/types";

const manifestSchema = z.object({
  version: z.string().min(1),
  productSummary: z.string().min(1),
  topology: z.array(z.string().min(1)).min(1),
  components: z.array(
    z.object({
      id: z.string().regex(/^[a-z0-9-]+$/),
      name: z.string().min(1),
      responsibility: z.string().min(1),
    }),
  ),
  claims: z.array(
    z.object({
      id: z.string().regex(/^[a-z0-9-]+$/),
      status: z.enum(claimStatuses),
      topics: z.array(z.string().min(1)).min(1),
      statement: z.string().min(1),
      reasoning: z.string().min(1),
      limitation: z.string().min(1).optional(),
      evidence: z.array(z.string().min(1)).min(1),
    }),
  ),
  followUpQuestions: z.array(z.string().min(1)),
});

const unsafePatterns = [
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
  /(^|[\s"'`])\/(?:Users|home|var|etc|opt|private)\//,
  /\b[A-Z]:\\Users\\/i,
  /https?:\/\/(?!(?:example\.com|localhost)(?:[/:]|$))[^\s"'`]+/i,
  /\bAuthorization\s*:\s*Bearer\b/i,
  /\b(?:PRIVATE_KEY|SECRET|TOKEN|PASSWORD)\s*=/i,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
];

export function validateArchitectureManifest(
  manifest: ArchitectureManifest,
): void {
  const parsed = manifestSchema.safeParse(manifest);
  if (!parsed.success) {
    throw new Error("invalid_architecture_manifest");
  }
  const values = collectStrings(parsed.data);
  if (
    values.some((value) =>
      unsafePatterns.some((pattern) => pattern.test(value)),
    )
  ) {
    throw new Error("unsafe_architecture_manifest");
  }
}

function collectStrings(value: unknown): string[] {
  if (typeof value === "string") {
    return [value];
  }
  if (Array.isArray(value)) {
    return value.flatMap(collectStrings);
  }
  if (value && typeof value === "object") {
    return Object.values(value).flatMap(collectStrings);
  }
  return [];
}
