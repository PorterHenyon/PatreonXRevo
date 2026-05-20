# Go-live checklist

Use this before opening PatreonXRevo to real patrons.

## 1. Discord (both servers)

- [ ] Bot invited to **Patreon server** and **main server** with **Manage Roles** + **Create Invite**
- [ ] **Server Members Intent** enabled in [Discord Developer Portal](https://discord.com/developers/applications) → Bot
- [ ] Bot role dragged **above** all auto-created tier roles in **each** server
- [ ] Copy both **Server IDs** (Developer Mode → right-click server → Copy Server ID)

Bot invite URL (replace `YOUR_CLIENT_ID`):

```
https://discord.com/api/oauth2/authorize?client_id=YOUR_CLIENT_ID&permissions=268435456&scope=bot%20applications.commands
```

## 2. Patreon API

- [ ] [Register API client](https://www.patreon.com/portal/registration/register-clients) on the **creator** account
- [ ] Redirect URI: `https://YOUR_DOMAIN/auth/patreon/callback`
- [ ] Copy **Client ID**, **Client Secret**, and **Webhook secret**

## 3. Environment (production `.env`)

- [ ] `APP_BASE_URL=https://YOUR_DOMAIN` (must be HTTPS for Patreon webhooks)
- [ ] `SESSION_SECRET` = long random string (32+ chars), not the example value
- [ ] `PATREON_GUILD_ID` and `MAIN_GUILD_ID` set
- [ ] `PATREON_REDIRECT_URI` and `DISCORD_REDIRECT_URI` use the same `APP_BASE_URL` host
- [ ] `PATREON_WEBHOOK_SECRET` set
- [ ] `DISCORD_BOT_TOKEN`, `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET` set
- [ ] `DATABASE_URL` points to a **persistent** path on your host (volume), e.g. `./data/patreonxrevo.db`

## 4. Discord OAuth redirects

In Discord Developer Portal → OAuth2 → Redirects, add:

```
https://YOUR_DOMAIN/auth/discord/callback
```

## 5. Deploy and verify

```bash
npm install
npm run build
npm start
```

`npm start` runs DB migration, startup checks, web server, and Discord bot.

- [ ] Open `https://YOUR_DOMAIN/health` → `"ok": true`, `"status": "healthy"` (or `degraded` with only warnings)
- [ ] Creator: `https://YOUR_DOMAIN/admin` → Log in with Patreon
- [ ] Confirm tier roles appear on **both** servers
- [ ] Patreon webhook URL in admin matches: `https://YOUR_DOMAIN/webhooks/patreon`

## 6. Test with a second account

- [ ] Patron flow: Connect Patreon → Connect Discord → roles on **both** servers
- [ ] Cancel or downgrade on Patreon → roles removed on **both** servers
- [ ] Re-subscribe → roles return

## 7. Tell your patrons

Post in Discord:

> Link Patreon + Discord once to get your supporter roles (updates automatically when you subscribe or cancel):  
> **https://YOUR_DOMAIN**

Optional: patrons can run `/link` in any server where the bot is present.

## 8. After launch

- [ ] Schedule daily backup sync: `npm run reconcile` (cron)
- [ ] Persist the `data/` folder (SQLite) on your host
- [ ] When adding new Patreon tiers: **Sync roles from Patreon** in admin

## Quick reference

| URL | Purpose |
|-----|---------|
| `/` | Patron linking |
| `/admin` | Creator setup |
| `/health` | Deploy health check |
| `/webhooks/patreon` | Patreon webhook (auto-registered on creator login) |
