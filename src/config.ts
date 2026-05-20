import { config as loadEnv } from "dotenv";
import { z } from "zod";
import { resolve } from "node:path";

loadEnv();

const envSchema = z.object({
  APP_BASE_URL: z.string().url(),
  SESSION_SECRET: z.string().min(16),
  PORT: z.coerce.number().default(3000),
  DEFAULT_GUILD_ID: z.string().optional(),
  /** Comma-separated Discord guild IDs to sync (e.g. Patreon server + main server) */
  SYNC_GUILD_IDS: z.string().optional(),
  PATREON_GUILD_ID: z.string().optional(),
  MAIN_GUILD_ID: z.string().optional(),
  PATREON_CLIENT_ID: z.string().min(1),
  PATREON_CLIENT_SECRET: z.string().min(1),
  PATREON_REDIRECT_URI: z.string().url(),
  PATREON_WEBHOOK_SECRET: z.string().optional(),
  DISCORD_CLIENT_ID: z.string().min(1),
  DISCORD_CLIENT_SECRET: z.string().min(1),
  DISCORD_BOT_TOKEN: z.string().min(1),
  DISCORD_REDIRECT_URI: z.string().url(),
  DATABASE_URL: z.string().default("./data/patreonxrevo.db"),
  PATREON_CREATOR_ACCESS_TOKEN: z.string().optional(),
  PATREON_CAMPAIGN_ID: z.string().optional(),
  /** Set to false to run HTTP/webhooks only without the Discord gateway bot */
  ENABLE_DISCORD_BOT: z
    .string()
    .optional()
    .transform((v) => v !== "false" && v !== "0"),
  AUTO_PROVISION_ON_START: z
    .string()
    .optional()
    .transform((v) => v === "true" || v === "1"),
});

export type Env = z.infer<typeof envSchema>;

function parseEnv(): Env {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const formatted = result.error.flatten().fieldErrors;
    console.error("Invalid environment variables:", formatted);
    process.exit(1);
  }
  return result.data;
}

export const env = parseEnv();

export function parseSyncGuildIdsFromEnv(): Array<{ guildId: string; label: string }> {
  const entries: Array<{ guildId: string; label: string }> = [];
  if (env.PATREON_GUILD_ID) {
    entries.push({ guildId: env.PATREON_GUILD_ID, label: "patreon" });
  }
  if (env.MAIN_GUILD_ID) {
    entries.push({ guildId: env.MAIN_GUILD_ID, label: "main" });
  }
  if (env.SYNC_GUILD_IDS) {
    for (const id of env.SYNC_GUILD_IDS.split(",").map((s) => s.trim()).filter(Boolean)) {
      if (!entries.some((e) => e.guildId === id)) {
        entries.push({ guildId: id, label: "server" });
      }
    }
  }
  if (env.DEFAULT_GUILD_ID && !entries.some((e) => e.guildId === env.DEFAULT_GUILD_ID)) {
    entries.push({ guildId: env.DEFAULT_GUILD_ID, label: "default" });
  }
  return entries;
}

export function dbPath(): string {
  const url = env.DATABASE_URL;
  if (url.startsWith("file:")) {
    return url.slice(5);
  }
  return resolve(process.cwd(), url);
}
