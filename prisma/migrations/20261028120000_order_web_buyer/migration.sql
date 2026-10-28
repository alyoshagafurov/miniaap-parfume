-- The browser a request was placed from, for «Мои заявки» on the site: the
-- SHA-256 of a random key in that browser's httpOnly cookie. Nullable, so every
-- earlier request stays where it was — visible in Telegram, not on the site.
ALTER TABLE "orders" ADD COLUMN "webBuyerHash" TEXT;

CREATE INDEX "orders_webBuyerHash_createdAt_idx" ON "orders"("webBuyerHash", "createdAt");
