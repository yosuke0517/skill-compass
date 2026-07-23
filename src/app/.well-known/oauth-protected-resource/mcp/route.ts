import { getEnv } from "@/lib/env";
import {
  noStoreJson,
  protectedResourceMetadata,
} from "@/lib/mcp/auth/http";

export async function GET() {
  const env = getEnv();
  if (!env.MCP_ISSUER_URL || !env.MCP_RESOURCE_URL) {
    return noStoreJson({ error: "mcp_not_configured" }, { status: 503 });
  }
  return noStoreJson(
    protectedResourceMetadata(env.MCP_ISSUER_URL, env.MCP_RESOURCE_URL),
  );
}
