import { env } from "../config.js";

const DISCORD_AUTHORIZE = "https://discord.com/api/oauth2/authorize";
const DISCORD_TOKEN = "https://discord.com/api/oauth2/token";
const DISCORD_API = "https://discord.com/api/v10";

export function discordAuthorizeUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: env.DISCORD_CLIENT_ID,
    redirect_uri: env.DISCORD_REDIRECT_URI,
    response_type: "code",
    scope: "identify guilds.join",
    state,
  });
  return `${DISCORD_AUTHORIZE}?${params}`;
}

export async function exchangeDiscordCode(code: string): Promise<{
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
  scope: string;
}> {
  const body = new URLSearchParams({
    client_id: env.DISCORD_CLIENT_ID,
    client_secret: env.DISCORD_CLIENT_SECRET,
    grant_type: "authorization_code",
    code,
    redirect_uri: env.DISCORD_REDIRECT_URI,
  });

  const res = await fetch(DISCORD_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Discord token exchange failed: ${res.status} ${text}`);
  }

  return res.json() as Promise<{
    access_token: string;
    token_type: string;
    expires_in: number;
    refresh_token: string;
    scope: string;
  }>;
}

export async function fetchDiscordUser(accessToken: string): Promise<{
  id: string;
  username: string;
  global_name: string | null;
}> {
  const res = await fetch(`${DISCORD_API}/users/@me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Discord user fetch failed: ${res.status} ${text}`);
  }

  return res.json() as Promise<{
    id: string;
    username: string;
    global_name: string | null;
  }>;
}

export async function addUserToGuild(
  discordUserId: string,
  accessToken: string,
  guildId: string
): Promise<void> {
  const res = await fetch(`${DISCORD_API}/guilds/${guildId}/members/${discordUserId}`, {
    method: "PUT",
    headers: {
      Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ access_token: accessToken }),
  });

  if (res.status === 204 || res.status === 201) return;
  if (res.status === 403) {
    const text = await res.text();
    throw new Error(`Cannot add user to guild (missing permissions?): ${text}`);
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Add to guild failed: ${res.status} ${text}`);
  }
}
