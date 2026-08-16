import { getCloudflareContext } from "@opennextjs/cloudflare";

import { isCloudflareWorkersRuntime } from "@/lib/runtime/cloudflare";

export type RuntimeBindings = Record<string, unknown>;

export function getRuntimeBindings(): RuntimeBindings {
  if (!isCloudflareWorkersRuntime()) return process.env;
  return getCloudflareContext().env as unknown as RuntimeBindings;
}

export function resolveRuntimeSecret(
  name: string,
  input: { cloudflare: boolean; bindings: RuntimeBindings },
): string | undefined {
  const value = input.bindings[name];
  if (typeof value === "string" && value.length > 0) return value;
  if (input.cloudflare) throw new Error(`Missing Cloudflare secret: ${name}`);
  return undefined;
}

export function getRuntimeSecret(name: string): string | undefined {
  const cloudflare = isCloudflareWorkersRuntime();
  return resolveRuntimeSecret(name, {
    cloudflare,
    bindings: getRuntimeBindings(),
  });
}
