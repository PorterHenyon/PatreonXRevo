import { env } from "../config.js";

const DISCORD_API = "https://discord.com/api/v10";

/** DM a Discord user if the bot shares a server with them (opens DM channel via REST). */
export async function dmUserLinkReminder(discordUserId: string): Promise<boolean> {
  try {
    const channelRes = await fetch(`${DISCORD_API}/users/@me/channels`, {
      method: "POST",
      headers: {
        Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ recipient_id: discordUserId }),
    });

    if (!channelRes.ok) return false;

    const channel = (await channelRes.json()) as { id: string };
    const msgRes = await fetch(`${DISCORD_API}/channels/${channel.id}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        content: `Thanks for supporting on Patreon! Link your accounts to get your Discord roles on all servers:\n${env.APP_BASE_URL}\n\nOr use \`/link\` in a server where this bot is present.`,
      }),
    });

    return msgRes.ok;
  } catch {
    return false;
  }
}
