import { env } from "../config.js";

const PATREON_AUTHORIZE = "https://www.patreon.com/oauth2/authorize";
const PATREON_TOKEN = "https://www.patreon.com/api/oauth2/token";

export function patreonAuthorizeUrl(state: string, scopes?: string): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: env.PATREON_CLIENT_ID,
    redirect_uri: env.PATREON_REDIRECT_URI,
    state,
  });
  if (scopes) {
    params.set("scope", scopes);
  }
  return `${PATREON_AUTHORIZE}?${params}`;
}

export function patreonCreatorAuthorizeUrl(state: string): string {
  return patreonAuthorizeUrl(
    state,
    "identity identity[email] campaigns campaigns.members w:campaigns.webhook"
  );
}

export async function exchangePatreonCode(code: string): Promise<{
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type: string;
  scope: string;
}> {
  const body = new URLSearchParams({
    code,
    grant_type: "authorization_code",
    client_id: env.PATREON_CLIENT_ID,
    client_secret: env.PATREON_CLIENT_SECRET,
    redirect_uri: env.PATREON_REDIRECT_URI,
  });

  const res = await fetch(PATREON_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Patreon token exchange failed: ${res.status} ${text}`);
  }

  return res.json() as Promise<{
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    token_type: string;
    scope: string;
  }>;
}
