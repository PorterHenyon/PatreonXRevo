import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { dbPath, parseSyncGuildIdsFromEnv } from "../config.js";
import { MIGRATION_SQL } from "./schema.js";
import { listSyncGuilds, upsertSyncGuild } from "./queries.js";

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    const path = dbPath();
    mkdirSync(dirname(path), { recursive: true });
    db = new Database(path);
    db.pragma("journal_mode = WAL");
    db.exec(MIGRATION_SQL);
    runIncrementalMigrations(db);
    seedSyncGuildsFromEnv();
  }
  return db;
}

function runIncrementalMigrations(database: Database.Database): void {
  const cols = database
    .prepare("PRAGMA table_info(patron_links)")
    .all() as Array<{ name: string }>;
  if (!cols.some((c) => c.name === "entitled_tier_ids")) {
    database.exec(
      "ALTER TABLE patron_links ADD COLUMN entitled_tier_ids TEXT"
    );
  }
}

function seedSyncGuildsFromEnv(): void {
  if (listSyncGuilds().length > 0) return;
  for (const { guildId, label } of parseSyncGuildIdsFromEnv()) {
    upsertSyncGuild(guildId, label);
  }
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
