-- DropIndex
DROP INDEX "fragrances_brandId_idx";

-- AlterTable
ALTER TABLE "admin_users" ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "brands" ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "categories" ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "fragrances" ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "login_codes" ALTER COLUMN "usedAt" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "orders" ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "product_images" ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "products" ALTER COLUMN "publishedAt" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "settings" ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "telegram_users" ALTER COLUMN "lastSeenAt" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMPTZ(3);

-- The one field the generated diff above missed, because it carries no default.
ALTER TABLE "login_codes" ALTER COLUMN "expiresAt" SET DATA TYPE TIMESTAMPTZ(3);

-- ─────────────────────────────────────────────────────────────────────────────
-- Review finding 1 [HIGH] — array columns were nullable in the database.
--
-- Prisma emits `TEXT[] DEFAULT ARRAY[]::TEXT[]` for a List field and, unlike
-- every other required column, does NOT add NOT NULL. Its own client types
-- never allow null, so this is only reachable from a writer that bypasses
-- Prisma — precisely the import/seed/maintenance scripts the CHECK constraints
-- already exist to defend against. A null here makes buildSearchText throw
-- "is not iterable" and takes the catalog down.
--
-- Prisma's differ will not generate these; they are hand-written, like the
-- constraints below.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE "brands"     ALTER COLUMN "aliases"    SET NOT NULL;
ALTER TABLE "fragrances" ALTER COLUMN "aliases"    SET NOT NULL;
ALTER TABLE "fragrances" ALTER COLUMN "families"   SET NOT NULL;
ALTER TABLE "fragrances" ALTER COLUMN "notesTop"   SET NOT NULL;
ALTER TABLE "fragrances" ALTER COLUMN "notesHeart" SET NOT NULL;
ALTER TABLE "fragrances" ALTER COLUMN "notesBase"  SET NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- Review finding 3 [MEDIUM-HIGH] — a product could exist with no fragrance.
--
-- Not expressible as a CHECK, because it is a cross-table aggregate. The
-- twin rules are already enforced (unique position, positions 0..1), but
-- nothing required at least one link, and a product without one renders a card
-- with no brand and no name.
--
-- DEFERRABLE INITIALLY DEFERRED so the natural write shape still works: a
-- product is inserted, then its links, then the transaction commits and the
-- check runs once against the final state. Any caller that replaces links with
-- delete-then-insert must do so inside one transaction — which is correct
-- regardless, since the alternative leaves the product momentarily invalid.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION arumi_product_requires_fragrance() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM product_fragrances WHERE "productId" = NEW.id) THEN
    RAISE EXCEPTION 'Товар % не имеет ни одного аромата', NEW.sku
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER products_require_fragrance
  AFTER INSERT OR UPDATE ON "products"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION arumi_product_requires_fragrance();

CREATE OR REPLACE FUNCTION arumi_fragrance_link_removed() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  -- Silent when the product itself is gone: that is a cascade delete, not a
  -- product left stranded without a fragrance.
  IF EXISTS (SELECT 1 FROM products WHERE id = OLD."productId")
     AND NOT EXISTS (SELECT 1 FROM product_fragrances WHERE "productId" = OLD."productId")
  THEN
    RAISE EXCEPTION 'У товара % не осталось ни одного аромата', OLD."productId"
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER product_fragrances_keep_at_least_one
  AFTER DELETE ON "product_fragrances"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION arumi_fragrance_link_removed();
