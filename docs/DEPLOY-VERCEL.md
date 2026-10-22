# ÁRUMI deployment on Vercel

This is the Vercel deployment path for the Next.js storefront, admin panel, and
Telegram bot. Vercel runs the bot through a Telegram webhook; the existing
`pnpm bot` long-polling process remains the Railway/VPS path.

## Existing Railway data

The old Railway account and its production database are not accessible, and no
production dump or credentials are present in this checkout. The Vercel setup
therefore starts with a new, empty PostgreSQL database. Do not run the demo seed
in production: it creates sample products and prices. Catalog content, orders,
administrator accounts, and stored photos from Railway cannot be recovered
without an export or restored Railway access.

## Services to provision

Create these services in regions close to the Vercel Functions region:

- PostgreSQL with `pg_trgm` available. Use its pooled URL for the app and a
  direct URL for migrations if the provider supplies both.
- Redis with TLS enabled (`rediss://…`). Rate limits fail closed when Redis is
  unavailable, including admin login and order submission.
- A public Vercel Blob store in the same region. The app uses it for catalog
  photos; Blob URLs are public because catalog photos are public assets.

Keep provider credentials in Vercel project environment variables. Do not put
them in Git or in `vercel.json`.

## Vercel project settings

Import the GitHub repository `alyoshagafurov/miniaap-parfume` into the
`alyosha's projects` team. Use the repository root and the detected Next.js
framework. `vercel.json` runs `vercel-build.sh`: production deployments generate
the Prisma client and apply migrations before building; preview deployments only
generate the client and do not migrate the production database.

Set these variables for **Production**:

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | Direct PostgreSQL URL for migrations |
| `DATABASE_URL_POOLED` | Pooled PostgreSQL URL for application traffic, when the provider offers one |
| `REDIS_URL` | Injected by the Upstash Redis integration |
| `BLOB_READ_WRITE_TOKEN` | Injected by the connected Vercel Blob store |
| `BLOB_STORE_ID` | Injected by the connected Vercel Blob store |
| `AUTH_SECRET` | New random value, at least 32 characters |
| `BOT_WEBHOOK_SECRET` | 32–256 random letters, digits, `_` or `-` |
| `BOT_TOKEN` | Current token from BotFather; see cutover below |
| `MINI_APP_URL` | Production HTTPS URL assigned by Vercel |
| `ADMIN_CHAT_ID` | Telegram user or group ID for order notifications |
| `ADMIN_LOGIN_REQUIRE_CODE` | `1` or unset to require the Telegram login code |
| `ENABLE_HSTS` | `1` |
| `TRUSTED_PROXY_HOPS` | `1` |
| `DEPLOY_TARGET` | `vercel` |

Add `BOT_USERNAME` and `NEXT_PUBLIC_YANDEX_METRICA_ID` only if they are needed.
Local development continues to use MinIO through the `S3_*` variables. When
`BLOB_READ_WRITE_TOKEN` is present, Vercel Blob is used instead. Its photo URLs
are served through `/api/media/*`; no public storage token is exposed to the
browser.

Use a temporary placeholder for `MINI_APP_URL` on the first build if Vercel has
not assigned the production domain yet, then replace it with the assigned HTTPS
origin and redeploy. The domain must not include a trailing slash.

## Cut over the Telegram bot

The Railway bot may still be polling Telegram. Its startup code deletes any
webhook, so it could remove the Vercel webhook if its process restarts. Because
Railway is inaccessible, rotate the token in BotFather before cutover: open
`/mybots`, choose the bot, and revoke the old API token. Put the replacement
token into Vercel's Production `BOT_TOKEN` variable and deploy again. The old
Railway process will then no longer be able to poll or change webhook settings.

After the production domain is live and the new token is set, create a local,
git-ignored `.env.production` with `BOT_TOKEN`, `BOT_WEBHOOK_SECRET`,
`MINI_APP_URL`, and `DATABASE_URL`, then run:

```sh
pnpm bot:webhook:set
```

The script registers `/api/telegram/webhook`, sets the Mini App menu button and
commands, and preserves pending Telegram updates. It does not print secrets.

## First administrator and catalog

The new database starts empty. The catalog is not seeded with demonstration
products. Use a Telegram user ID from `/id` and run `pnpm admin:create` against
the new database to create the owner account. Then add real products, settings,
and photographs in the admin panel. This requires the new database URL in the
local `.env.production` file.

## Health checks

- `GET /api/health` should return a successful response after migrations.
- Send `/start` to the bot and open the catalog button.
- Submit a test order and confirm it appears in the admin panel and reaches
  `ADMIN_CHAT_ID`.
- Sign in to the admin panel and verify a failed login is rate-limited.
