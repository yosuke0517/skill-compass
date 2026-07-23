import { getEnv } from "@/lib/env";
import {
  authorizationServerMetadata,
  noStoreJson,
} from "@/lib/mcp/auth/http";

export async function GET() {
  const env = getEnv();
  if (!env.MCP_ISSUER_URL) {
    return noStoreJson({ error: "mcp_not_configured" }, { status: 503 });
  }
  return noStoreJson(authorizationServerMetadata(env.MCP_ISSUER_URL));
}
