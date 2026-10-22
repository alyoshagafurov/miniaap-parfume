-- The volume discount taken off a request, and the percent it was. Both default
-- to nothing, so every request placed before this existed reads as it always did:
-- sold at the sum of its items, with no discount.
ALTER TABLE "orders" ADD COLUMN     "discountKop" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "discountPercent" INTEGER NOT NULL DEFAULT 0;
