import {
  Client,
  Events,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { env } from "../config.js";
import { getPatronByDiscordId } from "../db/queries.js";
import { getTargetSyncGuildIds, getCreatorToken } from "../db/queries.js";
import { syncPatronFromPatreon } from "../sync/apply-roles.js";
import { provisionAndSyncPatrons } from "../sync/provision-roles.js";

async function registerSlashCommands(clientId: string): Promise<void> {
  const commands = [
    new SlashCommandBuilder()
      .setName("link")
      .setDescription("Link your Patreon account to get your patron roles"),
  ].map((c) => c.toJSON());

  const rest = new REST({ version: "10" }).setToken(env.DISCORD_BOT_TOKEN);
  await rest.put(Routes.applicationCommands(clientId), { body: commands });
}

async function handleLinkCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  const url = env.APP_BASE_URL;
  await interaction.reply({
    content: `Link Patreon + Discord to sync your roles on all servers:\n${url}`,
    ephemeral: true,
  });
}

export async function startDiscordBot(): Promise<Client> {
  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
  });

  client.once(Events.ClientReady, async (readyClient) => {
    console.log(`Discord bot logged in as ${readyClient.user.tag}`);
    try {
      await registerSlashCommands(readyClient.user.id);
      console.log("Slash commands registered (/link)");
    } catch (err) {
      console.warn("Failed to register slash commands:", err);
    }

    if (env.AUTO_PROVISION_ON_START) {
      const creator = getCreatorToken();
      if (creator?.access_token) {
        try {
          const result = await provisionAndSyncPatrons(
            creator.access_token,
            creator.campaign_id
          );
          console.log("Auto-provision on start:", result);
        } catch (err) {
          console.warn("Auto-provision on start failed:", err);
        }
      }
    }
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName === "link") {
      await handleLinkCommand(interaction);
    }
  });

  client.on(Events.GuildMemberAdd, async (member) => {
    const syncGuilds = new Set(getTargetSyncGuildIds());
    if (!syncGuilds.has(member.guild.id)) return;

    const patron = getPatronByDiscordId(member.id);
    if (!patron) return;

    try {
      await syncPatronFromPatreon(patron.patreon_user_id, "discord:guild_member_add", {
        guildId: member.guild.id,
      });
    } catch (err) {
      console.warn(`Re-sync on join failed for ${member.id}:`, err);
    }
  });

  await client.login(env.DISCORD_BOT_TOKEN);
  return client;
}
