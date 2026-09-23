# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Decided by the client in the stage-1 brief (not delegated): Next.js 16 App Router + React 19 +
TypeScript strict + Tailwind CSS v4 + Motion; PostgreSQL 16 + Prisma; Redis; S3-compatible
object storage. The Telegram bot is grammY running as a **separate process from the same
repository**, sharing the database. The Mini App uses `@telegram-apps/sdk-react`.

Two hard runtime constraints follow from operating inside Russia (stage 3 hosting):

- `api.telegram.org` is blocked from Russian servers, so every Bot API call goes through a
  configurable `TELEGRAM_API_ROOT` relay hosted outside Russia. **Long polling only — webhooks
  are not used.**
- No Vercel / Cloudflare services at runtime, and no Google Fonts CDN. Fonts are self-hosted.

## Users

**Primary — the wholesale buyer.** Shop owners and market-stall traders across Russia who
resell perfume and personal care. They open the catalog on a phone, inside Telegram, roughly
nine times in ten. They are buying stock, not shopping: they already know the brands, they are
checking what is available, in which format, at what price, and whether it clears the minimum
order.

**Secondary — the owner/administrator.** Runs the catalog personally. Adds fragrances, products,
photos and prices either from Telegram on a phone or from a browser on a computer. Not a
merchandiser and not technical; the admin UI is the only tool.

**Secondary — the manager.** Receives each submitted request in a Telegram chat with its full
contents, total and contacts, then works it by phone or WhatsApp and moves its status.

## Product Purpose

A wholesale catalog of 1000+ items with search and filters that a buyer can work through on a
phone, ending in a **request** (not a payment) that reaches a manager in Telegram. The business
currently takes orders by phone and WhatsApp; the product replaces "what do you have in stock?"
with a catalog the buyer can browse without occupying a person, while keeping the human close
at hand for the close.

Success: a buyer who has never seen the catalog can find a specific fragrance in a specific
format and submit a request that clears the minimum order, without being taught how.

## Positioning

The catalog is organised **Brand → Fragrance → Product**, not as a flat product list. One
fragrance exists in several formats and bottle sizes, and the buyer can pivot between them from
any product page ("this fragrance in other formats"). The "twins" format — one 100 ml bottle
carrying two fragrances — is modelled first-class as a product holding two fragrances, not as a
naming convention in a title field.

Competitors in this trade sell from photo albums in Telegram channels and WhatsApp price lists,
where the same fragrance in three formats is three unrelated pictures. Making the fragrance the
organising entity is the thing a neighbouring seller cannot copy by posting better photos.

Second, deliberate, position: the catalog is a **working website as well as a Mini App**. If
Telegram is blocked or the buyer is not in it, the same link opens the same catalog in a plain
browser.

## Operating Context

- The business is a wholesale warehouse in Khasavyurt, "Novy Terek" market. It ships across
  Russia via CDEK, Russian Post, freight carriers, or pickup at the market.
- Contact is by call or WhatsApp at 8 928 314 40 00. Minimum order 5 000 ₽.
- **The buyer is on a market floor or in their own shop, phone in one hand**, between other
  tasks, often in daylight. Significant elements belong within thumb reach; touch targets stay
  large; contrast has to survive a bright screen.
- **The mobile network is weak or expensive.** Buyers count traffic. Image weight and
  first-screen JavaScript are product constraints, not performance nice-to-haves. A basket must
  survive a dropped connection.
- Interface language is Russian throughout. Currency RUB. Timezone Europe/Moscow.
- Starting categories: perfume 35 ml "pencils", perfume 100 ml, perfume 2-in-1 "twins" 100 ml,
  deodorants 200 ml.

## Capabilities and Constraints

- **No online payment.** The basket is a request; money is settled with the manager. This is a
  deliberate business decision, not a missing feature.
- Prices are **visible to everyone by default**, including in a plain browser. A setting lets
  the administrator hide them, in which case the catalog shows "price on request" and requests
  are collected without totals. (Confirmed with the client.)
- The server always recalculates prices, the order minimum and pack multiples. Client-side
  totals are display only.
- Admin access has two paths: inside Telegram, a signed `initData` whose `telegramId` is on the
  admin allow-list plus a password; in a browser, a password plus a single-use 6-digit code the
  bot sends to the administrator. Roles are OWNER (everything) and EDITOR (catalog and requests).
- Catalog content arrives by two routes that must both work: an .xlsx/.csv import keyed on SKU
  (idempotent — re-importing the same file must not duplicate), and hand entry in the admin UI.
- Undecided, to be settled with the client before stage 3: the domain, and in whose name
  BotFather, hosting and object storage are registered.

## Brand Commitments

- Name: **ÁRUMI Parfum & Care**. The acute on the Á is part of the mark.
- Confirmed copy: "Известные бренды · Выгодные условия · Надёжные поставки" and
  "ÁRUMI — ваш оптовый партнёр".
- Logo: `./logo.jpg`, 1024×1024. Measured from the file:
  - wordmark olive **#4D522C** (thick strokes, true ink)
  - flourish gold **≈#C9A34C** (hairline; core #C8962C, perceived body #CBAF6B)
  - "PARFUM & CARE" subtitle is **neutral graphite #2B2D2C**, not a warm black
  - the mark carries a **braided gold guilloche rule** under the wordmark — this is the origin
    of the "golden thread" device the design direction reuses as its only repeating divider
- **The supplied logo has an opaque white (#FDFDFD) background**, so it cannot be placed on a
  coloured surface as-is. A transparent PNG or SVG is still needed from the client.
- **No emoji anywhere** — not in the interface, not in bot buttons or messages.

## Evidence on Hand

- `./logo.jpg` — real, supplied by the client. Opaque white background (see above).
- **Product photography exists but is not available to this build.** The client has photographs
  of the whole range in their own Telegram channel, and has decided to **enter the products
  themselves** through the admin UI. Consequence for the product: the admin photo flow (multi-
  file drag-and-drop, ordering, cover selection, and bulk attachment by `<sku>-1.jpg` filename)
  is a primary surface, not a convenience — it is the only path real photography takes into the
  system. The catalog must also look finished with no photograph at all.
- **No assortment file, price list, or brand/fragrance list has been supplied.** The import
  template's columns are therefore designed from the data model, and will need review against a
  real client file before stage 3.
- **No test bot token and no admin chat id.** Live Bot API behaviour cannot be exercised in
  stage 1; bot handlers are covered by mocks instead.
- Everything visible in stage 1 is **seeded demo data, explicitly flagged as demo**. No real
  brand, fragrance, price, stock level or customer in this build is a factual claim about the
  client's business.

## Product Principles

1. **The fragrance is the thing, not the SKU.** Anywhere a buyer meets a product they can see
   the same fragrance's other formats. Never make someone search twice for one scent.
2. **The request must always be reachable.** Running total, distance to the minimum order, and
   the way to submit stay visible and within thumb reach; the human contact never more than one
   tap away.
3. **The server is the authority on money.** Prices, totals, minimums and pack multiples are
   recomputed server-side on every submission. The client is a display.
4. **Assume a bad network and a bright screen.** Every image and every kilobyte of first-screen
   JavaScript has to earn its place; nothing essential depends on an animation or a fast
   connection.
5. **Emptiness is a designed state.** Missing photography, an empty search, an empty basket and
   an empty catalog are composed states that look intentional — because at launch most of them
   are what the buyer will actually see.

## Accessibility & Inclusion

- The audience skews non-technical and over 40, accustomed to phoning and to WhatsApp. The path
  from "opened the bot" to "submitted a request" must be legible without instruction, and the
  call/WhatsApp escape hatch stays available at every step.
- Outdoor, one-handed phone use sets the floor: text contrast at least 4.5:1, touch targets at
  least 44px, primary actions in the lower third of the screen.
- Gold is a decorative rule only. At 2.14:1 on the brand background it can never carry text or
  signal state — verified by measurement, not assumption.
- Motion is limited to sheets and modals, at most 250 ms, and must respect
  `prefers-reduced-motion`.
- The catalog must remain fully usable outside Telegram, with a keyboard, in a plain browser.
