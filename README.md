# PatreonXRevo

Sync Patreon pledges to Discord roles on **multiple servers**.

Patreon’s built-in Discord integration only connects **one** server per campaign. Use this app when you want the same patron roles on both your **Patreon server** and your **main server** (or any number of servers).

## How it works

1. **Patrons** link Patreon + Discord once on your site (or use `/link` in Discord).
2. **Patreon webhooks** notify your app when pledges are created, updated, or cancelled.
3. A **hosted Discord bot** (gateway) runs alongside a small **web server** on the same machine.
4. On setup, the bot **auto-creates Discord roles** for each Patreon tier (e.g. `Gold Supporter ($5)`) on **both** servers.
5. Roles are granted/revoked via the Discord API when pledges change.

When someone rejoins a server, the bot re-applies their patron roles automatically.

## Path A: Patreon native (one server only)

If you only need **one** Discord server, use [Patreon’s Discord integration](https://support.patreon.com/hc/en-us/articles/213552323-Setting-up-Discord-for-your-members) and skip this project.

## Path B: This project (multi-server)

### 1. Discord Application

1. Create an app at [Discord Developer Portal](https://discord.com/developers/applications).
2. **Bot** → create bot, copy token → `DISCORD_BOT_TOKEN`.
3. **Bot** → enable **Server Members Intent** (required for re-sync when members rejoin).
4. **OAuth2** → add redirect: `{APP_BASE_URL}/auth/discord/callback` → `DISCORD_REDIRECT_URI`.
5. Invite the bot to **both** servers with `Manage Roles` and `Create Instant Invite`:

```
https://discord.com/api/oauth2/authorize?client_id=YOUR_CLIENT_ID&permissions=268435456&scope=bot%20applications.commands
```

(`268435456` = Manage Roles + Create Invite)

6. In **each** server, drag the bot’s role **above** the tier roles it will assign.

### 2. Patreon API client

1. Register at [Patreon API Clients](https://www.patreon.com/portal/registration/register-clients) (creator account required).
2. Set redirect URI: `{APP_BASE_URL}/auth/patreon/callback`.
3. Copy Client ID / Secret → `PATREON_CLIENT_ID`, `PATREON_CLIENT_SECRET`.
4. After first creator login, copy webhook secret from the portal → `PATREON_WEBHOOK_SECRET`.

### 3. Configure environment

```bash
cp .env.example .env
```

Key variables for **two servers**:

```env
APP_BASE_URL=https://your-app.example.com
SESSION_SECRET=long-random-string

PATREON_CLIENT_ID=
PATREON_CLIENT_SECRET=
PATREON_REDIRECT_URI=https://your-app.example.com/auth/patreon/callback
PATREON_WEBHOOK_SECRET=

DISCORD_CLIENT_ID=
DISCORD_CLIENT_SECRET=
DISCORD_BOT_TOKEN=
DISCORD_REDIRECT_URI=https://your-app.example.com/auth/discord/callback

# Your two Discord server IDs (right-click server → Copy Server ID)
PATREON_GUILD_ID=123456789012345678
MAIN_GUILD_ID=987654321098765432
```

Or add servers later in **Creator admin** (`/admin`).

### 4. Run locally

```bash
npm install
npm run db:migrate
npm run dev
```

Open `http://localhost:3000`.

### 5. Creator setup

1. Set `PATREON_GUILD_ID` and `MAIN_GUILD_ID` in `.env` (or add servers in admin).
2. Go to `/admin` → **Log in with Patreon** (creator account).
3. Roles are **auto-created** on both servers on first login (named `Tier Title ($price)`).
4. To refresh after adding Patreon tiers, click **Sync roles from Patreon** in admin (or run `npm run provision`).
5. Webhooks register automatically on creator login (requires public HTTPS in production).

Put the bot role **above** the auto-created tier roles in each server’s role list.

### 6. Patron flow (required for role sync)

Patrons must **link once** so the app knows their Patreon ID ↔ Discord ID:

1. Visit your site → **Connect Patreon** → **Connect Discord** (or use `/link` in Discord).
2. They are added to both servers (if `guilds.join` and bot permissions allow).
3. **Active pledge** → tier roles added on **both** servers.
4. **Cancel / payment fails / pledge deleted** → tier roles removed on **both** servers (they stay in the server).

Patrons who pay on Patreon but never link will **not** receive roles until they complete step 1. Check admin **Role sync activity** for `unlinked_patron` entries.

**Message to post in your Discord:**

> Link Patreon + Discord to get your supporter roles: `{your APP_BASE_URL}`  
> You need to link once. Roles update automatically when you subscribe, change tier, or cancel.

### 7. CLI commands (optional)

```bash
npm run provision   # Create/update tier roles on all servers + sync linked patrons
npm run reconcile   # Re-sync all patrons from Patreon API
```

Requires creator OAuth in the database, or `PATREON_CREATOR_ACCESS_TOKEN` + `PATREON_CAMPAIGN_ID` in `.env`.

Set `AUTO_PROVISION_ON_START=true` to re-provision roles whenever the bot restarts (after creator has logged in once).

## Hosting the bot

Run **one process** that keeps both the web app and Discord bot online (VPS, Railway, Render, Fly.io, etc.):

```bash
npm run build
npm start
```

`npm start` runs the Hono web server **and** logs the bot into Discord (`ENABLE_DISCORD_BOT=true` by default).

| Component | Purpose |
|-----------|---------|
| Web server (`PORT`) | OAuth linking, admin UI, Patreon webhooks |
| Discord bot (gateway) | `/link` command, re-sync roles when members rejoin |

For local dev, use a tunnel (e.g. ngrok) so Patreon webhooks reach your machine:

```bash
ngrok http 3000
# set APP_BASE_URL to the https ngrok URL
```

Set `ENABLE_DISCORD_BOT=false` only if you want webhooks + OAuth without the gateway (no `/link`, no rejoin sync).

## Deploy notes

- `APP_BASE_URL` must be your public HTTPS URL (Patreon webhooks require HTTPS).
- Persist `DATABASE_URL` path or use a volume for SQLite on your host.
- Schedule `npm run reconcile` via cron for backup sync if webhooks are missed.
- On a VPS, use `pm2 start npm --name patreonxrevo -- start` to restart on reboot.

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Roles not applied | Bot role must be above tier roles in Discord |
| User not in server | Patron must join both servers, or bot needs `guilds.join` + invite permissions |
| Webhook 401 | Set `PATREON_WEBHOOK_SECRET` correctly |
| Only one server updates | Set both `PATREON_GUILD_ID` and `MAIN_GUILD_ID`; run **Sync roles from Patreon** |
| Roles not created | Bot needs Manage Roles; click **Sync roles from Patreon** in admin |

## License

MIT
