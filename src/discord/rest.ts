import { env } from "../config.js";

const DISCORD_API = "https://discord.com/api/v10";

export interface DiscordRole {
  id: string;
  name: string;
  position: number;
  managed: boolean;
}

export interface DiscordGuild {
  id: string;
  name: string;
}

async function discordFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${DISCORD_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
}

export async function getBotGuilds(): Promise<DiscordGuild[]> {
  const res = await discordFetch("/users/@me/guilds");
  if (!res.ok) {
    throw new Error(`Failed to list guilds: ${res.status}`);
  }
  return res.json() as Promise<DiscordGuild[]>;
}

export async function getGuildRoles(guildId: string): Promise<DiscordRole[]> {
  const res = await discordFetch(`/guilds/${guildId}/roles`);
  if (!res.ok) {
    throw new Error(`Failed to list roles: ${res.status}`);
  }
  const roles = (await res.json()) as DiscordRole[];
  return roles.filter((r) => r.name !== "@everyone" && !r.managed);
}

export async function getGuildRole(
  guildId: string,
  roleId: string
): Promise<DiscordRole | null> {
  const roles = await getGuildRoles(guildId);
  return roles.find((r) => r.id === roleId) ?? null;
}

export function findGuildRoleByName(
  roles: DiscordRole[],
  name: string
): DiscordRole | undefined {
  return roles.find((r) => r.name === name);
}

export async function createGuildRole(
  guildId: string,
  options: { name: string; color?: number; reason?: string }
): Promise<DiscordRole> {
  const res = await discordFetch(`/guilds/${guildId}/roles`, {
    method: "POST",
    body: JSON.stringify({
      name: options.name,
      color: options.color,
      reason: options.reason ?? "PatreonXRevo tier sync",
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Create role failed: ${res.status} ${text}`);
  }
  return res.json() as Promise<DiscordRole>;
}

export async function updateGuildRole(
  guildId: string,
  roleId: string,
  options: { name?: string; color?: number; reason?: string }
): Promise<DiscordRole> {
  const res = await discordFetch(`/guilds/${guildId}/roles/${roleId}`, {
    method: "PATCH",
    body: JSON.stringify({
      name: options.name,
      color: options.color,
      reason: options.reason ?? "PatreonXRevo tier sync",
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Update role failed: ${res.status} ${text}`);
  }
  return res.json() as Promise<DiscordRole>;
}

export async function addMemberRole(
  guildId: string,
  userId: string,
  roleId: string
): Promise<void> {
  const res = await discordFetch(`/guilds/${guildId}/members/${userId}/roles/${roleId}`, {
    method: "PUT",
  });
  if (res.status === 204) return;
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Add role failed: ${res.status} ${text}`);
  }
}

export async function removeMemberRole(
  guildId: string,
  userId: string,
  roleId: string
): Promise<void> {
  const res = await discordFetch(`/guilds/${guildId}/members/${userId}/roles/${roleId}`, {
    method: "DELETE",
  });
  if (res.status === 204) return;
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Remove role failed: ${res.status} ${text}`);
  }
}

export async function getMemberRoleIds(
  guildId: string,
  userId: string
): Promise<string[] | null> {
  const res = await discordFetch(`/guilds/${guildId}/members/${userId}`);
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`Get member failed: ${res.status}`);
  }
  const member = (await res.json()) as { roles: string[] };
  return member.roles;
}
