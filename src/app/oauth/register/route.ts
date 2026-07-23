import { randomUUID } from "node:crypto";
import { z } from "zod";

import { noStoreJson, validateRedirectUri } from "@/lib/mcp/auth/http";
import { saveMcpOAuthClient } from "@/lib/mcp/auth/repository";

const registrationSchema = z.object({
  client_name: z.string().trim().min(1).max(191).default("ChatGPT"),
  redirect_uris: z.array(z.string()).min(1).max(10),
});

export async function POST(request: Request) {
  const parsed = registrationSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return noStoreJson({ error: "invalid_client_metadata" }, { status: 400 });
  }

  try {
    const redirectUris = parsed.data.redirect_uris.map(validateRedirectUri);
    const clientId = `mcp_client_${randomUUID()}`;
    await saveMcpOAuthClient({
      id: clientId,
      redirectUris,
      clientName: parsed.data.client_name,
    });
    return noStoreJson(
      {
        client_id: clientId,
        client_name: parsed.data.client_name,
        redirect_uris: redirectUris,
        token_endpoint_auth_method: "none",
        grant_types: ["authorization_code"],
        response_types: ["code"],
      },
      { status: 201 },
    );
  } catch {
    return noStoreJson({ error: "invalid_redirect_uri" }, { status: 400 });
  }
}
