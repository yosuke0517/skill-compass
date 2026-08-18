const CLOUDFLARE_WORKERS_USER_AGENT = "Cloudflare-Workers";

export function isCloudflareWorkersRuntime(): boolean {
  return (
    typeof navigator !== "undefined" &&
    navigator.userAgent === CLOUDFLARE_WORKERS_USER_AGENT
  );
}

export function assertNotCloudflareWorkersRuntime(capability: string): void {
  if (isCloudflareWorkersRuntime()) {
    throw new Error(`${capability} is unavailable in the Cloudflare Workers runtime.`);
  }
}
