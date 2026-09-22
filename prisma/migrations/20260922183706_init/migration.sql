-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "unaccent";

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('FEMALE', 'MALE', 'UNISEX');

-- CreateEnum
CREATE TYPE "Family" AS ENUM ('FLORAL', 'ORIENTAL', 'WOODY', 'FRESH', 'CITRUS', 'AQUATIC', 'FOUGERE', 'CHYPRE', 'GOURMAND', 'SPICY', 'LEATHER', 'MUSK');

-- CreateEnum
CREATE TYPE "StockState" AS ENUM ('IN_STOCK', 'LOW', 'OUT', 'PREORDER');

-- CreateEnum
CREATE TYPE "PublishStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "OrderSource" AS ENUM ('TELEGRAM', 'WEB');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('NEW', 'IN_PROGRESS', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DeliveryMethod" AS ENUM ('CDEK', 'RUSSIAN_POST', 'TRANSPORT_COMPANY', 'PICKUP');

-- CreateEnum
CREATE TYPE "AdminRole" AS ENUM ('OWNER', 'EDITOR');

-- CreateTable
CREATE TABLE "brands" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "brands_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fragrances" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "gender" "Gender" NOT NULL DEFAULT 'UNISEX',
    "families" "Family"[] DEFAULT ARRAY[]::"Family"[],
    "notesTop" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notesHeart" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notesBase" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "description" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fragrances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subtitle" TEXT,
    "slug" TEXT NOT NULL,
    "coverKey" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "volumeMl" INTEGER NOT NULL,
    "priceKop" INTEGER NOT NULL,
    "oldPriceKop" INTEGER,
    "packSize" INTEGER NOT NULL DEFAULT 1,
    "stock" "StockState" NOT NULL DEFAULT 'IN_STOCK',
    "status" "PublishStatus" NOT NULL DEFAULT 'DRAFT',
    "isNew" BOOLEAN NOT NULL DEFAULT false,
    "isHit" BOOLEAN NOT NULL DEFAULT false,
    "popularity" INTEGER NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "publishedAt" TIMESTAMP(3),
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "searchText" TEXT NOT NULL DEFAULT '',
    "searchNotes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_fragrances" (
    "productId" TEXT NOT NULL,
    "fragranceId" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "product_fragrances_pkey" PRIMARY KEY ("productId","fragranceId")
);

-- CreateTable
CREATE TABLE "product_images" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "blurDataUrl" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "telegram_users" (
    "id" TEXT NOT NULL,
    "telegramId" BIGINT NOT NULL,
    "firstName" TEXT,
    "username" TEXT,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "botBlocked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "telegram_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "telegramUserId" TEXT,
    "source" "OrderSource" NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "delivery" "DeliveryMethod" NOT NULL,
    "comment" TEXT,
    "status" "OrderStatus" NOT NULL DEFAULT 'NEW',
    "totalKop" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productId" TEXT,
    "sku" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "brandName" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "priceKop" INTEGER NOT NULL,
    "qty" INTEGER NOT NULL,
    "imageKey" TEXT,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_users" (
    "id" TEXT NOT NULL,
    "telegramId" BIGINT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "AdminRole" NOT NULL DEFAULT 'EDITOR',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admin_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "login_codes" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "login_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "companyName" TEXT NOT NULL DEFAULT 'ÁRUMI Parfum & Care',
    "address" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "whatsappPhone" TEXT NOT NULL DEFAULT '',
    "minOrderKop" INTEGER NOT NULL DEFAULT 500000,
    "showPrices" BOOLEAN NOT NULL DEFAULT true,
    "deliveryTerms" TEXT NOT NULL DEFAULT '',
    "botGreeting" TEXT NOT NULL DEFAULT '',
    "bannerKey" TEXT,
    "bannerFileId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "brands_slug_key" ON "brands"("slug");

-- CreateIndex
CREATE INDEX "brands_isPublished_sortOrder_idx" ON "brands"("isPublished", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "fragrances_slug_key" ON "fragrances"("slug");

-- CreateIndex
CREATE INDEX "fragrances_brandId_idx" ON "fragrances"("brandId");

-- CreateIndex
CREATE UNIQUE INDEX "fragrances_brandId_name_key" ON "fragrances"("brandId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "categories_slug_key" ON "categories"("slug");

-- CreateIndex
CREATE INDEX "categories_isPublished_sortOrder_idx" ON "categories"("isPublished", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "products_sku_key" ON "products"("sku");

-- CreateIndex
CREATE UNIQUE INDEX "products_slug_key" ON "products"("slug");

-- CreateIndex
CREATE INDEX "products_searchText_idx" ON "products" USING GIN ("searchText" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "products_searchNotes_idx" ON "products" USING GIN ("searchNotes" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "products_categoryId_status_sortOrder_idx" ON "products"("categoryId", "status", "sortOrder");

-- CreateIndex
CREATE INDEX "products_status_publishedAt_idx" ON "products"("status", "publishedAt");

-- CreateIndex
CREATE INDEX "products_status_isNew_publishedAt_idx" ON "products"("status", "isNew", "publishedAt");

-- CreateIndex
CREATE INDEX "products_status_isHit_popularity_idx" ON "products"("status", "isHit", "popularity");

-- CreateIndex
CREATE INDEX "product_fragrances_fragranceId_idx" ON "product_fragrances"("fragranceId");

-- CreateIndex
CREATE UNIQUE INDEX "product_fragrances_productId_position_key" ON "product_fragrances"("productId", "position");

-- CreateIndex
CREATE INDEX "product_images_productId_sortOrder_idx" ON "product_images"("productId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "telegram_users_telegramId_key" ON "telegram_users"("telegramId");

-- CreateIndex
CREATE UNIQUE INDEX "orders_number_key" ON "orders"("number");

-- CreateIndex
CREATE INDEX "orders_status_createdAt_idx" ON "orders"("status", "createdAt");

-- CreateIndex
CREATE INDEX "orders_telegramUserId_createdAt_idx" ON "orders"("telegramUserId", "createdAt");

-- CreateIndex
CREATE INDEX "order_items_orderId_idx" ON "order_items"("orderId");

-- CreateIndex
CREATE INDEX "order_items_productId_idx" ON "order_items"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "admin_users_telegramId_key" ON "admin_users"("telegramId");

-- CreateIndex
CREATE INDEX "login_codes_adminId_expiresAt_idx" ON "login_codes"("adminId", "expiresAt");

-- AddForeignKey
ALTER TABLE "fragrances" ADD CONSTRAINT "fragrances_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brands"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_fragrances" ADD CONSTRAINT "product_fragrances_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_fragrances" ADD CONSTRAINT "product_fragrances_fragranceId_fkey" FOREIGN KEY ("fragranceId") REFERENCES "fragrances"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_telegramUserId_fkey" FOREIGN KEY ("telegramUserId") REFERENCES "telegram_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "login_codes" ADD CONSTRAINT "login_codes_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "admin_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- Everything below is outside Prisma's schema language.
--
-- The trigram indexes and the pg_trgm/unaccent extensions are deliberately NOT
-- here: they are declared in schema.prisma so Prisma manages them. Written as
-- raw SQL they are invisible to Prisma's diff, which drops them the next time
-- anything unrelated changes — which is precisely what happened before this
-- migration was squashed.
--
-- A note on why normalisation is not an index expression: unaccent() is STABLE,
-- not IMMUTABLE, because it depends on a mutable dictionary. Indexing it is a
-- known way to corrupt an index silently. The application therefore writes an
-- already-normalised value into searchText, and the indexes sit on the plain
-- column.
-- ─────────────────────────────────────────────────────────────────────────────

-- Request numbers (ARM-000123). A sequence rather than max(number)+1: two
-- buyers submitting at the same moment must not be handed the same number.
CREATE SEQUENCE IF NOT EXISTS "order_number_seq" START 1;

-- ── Business rules enforced by the database ──────────────────────────────────
-- These duplicate checks that also live in zod on the server. That is
-- deliberate: the import path, the seed and any future maintenance script all
-- write through the database, and a rule enforced in only one code path is a
-- rule that will eventually be bypassed.

-- Settings is a singleton.
ALTER TABLE "settings" ADD CONSTRAINT "settings_singleton_chk" CHECK ("id" = 1);
ALTER TABLE "settings" ADD CONSTRAINT "settings_minorder_nonneg_chk" CHECK ("minOrderKop" >= 0);

-- Money is non-negative integer kopecks, and a "discount" must actually be one.
ALTER TABLE "products" ADD CONSTRAINT "products_price_nonneg_chk" CHECK ("priceKop" >= 0);
ALTER TABLE "products" ADD CONSTRAINT "products_oldprice_higher_chk" CHECK ("oldPriceKop" IS NULL OR "oldPriceKop" > "priceKop");
ALTER TABLE "products" ADD CONSTRAINT "products_packsize_chk" CHECK ("packSize" >= 1);
ALTER TABLE "products" ADD CONSTRAINT "products_volume_chk" CHECK ("volumeMl" > 0);

ALTER TABLE "order_items" ADD CONSTRAINT "order_items_qty_chk" CHECK ("qty" > 0);
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_price_nonneg_chk" CHECK ("priceKop" >= 0);
ALTER TABLE "orders" ADD CONSTRAINT "orders_total_nonneg_chk" CHECK ("totalKop" >= 0);

-- A twin carries two fragrances, a normal product one; either way positions
-- start at 0 and stay contiguous.
ALTER TABLE "product_fragrances" ADD CONSTRAINT "product_fragrances_position_chk" CHECK ("position" >= 0 AND "position" <= 1);

-- One-time login codes must not accumulate attempts without limit.
ALTER TABLE "login_codes" ADD CONSTRAINT "login_codes_attempts_chk" CHECK ("attempts" >= 0 AND "attempts" <= 5);
