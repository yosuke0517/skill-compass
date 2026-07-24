import { requireCurrentUser } from "@/lib/access/current-user";
import { getEnv } from "@/lib/env";
import { getMcpConsent } from "@/lib/mcp/auth/consent";
import { getMcpOAuthClient } from "@/lib/mcp/auth/repository";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function McpAuthorizePage({ searchParams }: Props) {
  const user = await requireCurrentUser();
  const env = getEnv();
  const params = await searchParams;
  const clientId = value(params.client_id);
  const redirectUri = value(params.redirect_uri);
  const state = value(params.state);
  const codeChallenge = value(params.code_challenge);
  const resource = value(params.resource);
  const consent = getMcpConsent(resource, {
    learningResourceUrl: env.MCP_RESOURCE_URL ?? "",
    architectureResourceUrl: env.MCP_ARCHITECTURE_RESOURCE_URL,
  });
  const valid =
    value(params.response_type) === "code" &&
    value(params.code_challenge_method) === "S256" &&
    Boolean(clientId && redirectUri && state && codeChallenge && consent);
  const client = valid ? await getMcpOAuthClient(clientId) : null;
  const authorized =
    client &&
    client.redirectUris.includes(redirectUri) &&
    user.id === env.MCP_ALLOWED_USER_ID;

  if (!authorized) {
    return <main><h1>Connection request rejected</h1><p>The OAuth request is invalid or this account is not allowed.</p></main>;
  }

  return (
    <main className="mobile-shell">
      <section className="app-surface">
        <p className="eyebrow">ChatGPT connection</p>
        <h1>Connect {client.clientName}</h1>
        <p>{consent?.summary}</p>
        <ul>
          {consent?.capabilities.map((capability) => (
            <li key={capability}>{capability}</li>
          ))}
        </ul>
        <form action="/oauth/authorize/decision" method="post">
          <input type="hidden" name="client_id" value={clientId} />
          <input type="hidden" name="redirect_uri" value={redirectUri} />
          <input type="hidden" name="state" value={state} />
          <input type="hidden" name="code_challenge" value={codeChallenge} />
          <button type="submit">Connect</button>
        </form>
      </section>
    </main>
  );
}

function value(input: string | string[] | undefined): string {
  return typeof input === "string" ? input : "";
}
