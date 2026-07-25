type XAuthorizeInput = {
  clientId: string;
  redirectUri: string;
  state: string;
  challenge: string;
};

export function buildXAuthorizeUrl(input: XAuthorizeInput) {
  const authorize = new URL("https://x.com/i/oauth2/authorize");
  authorize.searchParams.set("response_type", "code");
  authorize.searchParams.set("client_id", input.clientId);
  authorize.searchParams.set("redirect_uri", input.redirectUri);
  authorize.searchParams.set(
    "scope",
    "tweet.read users.read offline.access",
  );
  authorize.searchParams.set("state", input.state);
  authorize.searchParams.set("code_challenge", input.challenge);
  authorize.searchParams.set("code_challenge_method", "S256");
  return authorize;
}
