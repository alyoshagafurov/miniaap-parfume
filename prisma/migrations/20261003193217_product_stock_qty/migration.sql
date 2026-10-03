-- How many units are on the shelf, when the owner keeps count. Nullable on
-- purpose: null is «не веду учёт», and every existing product starts there, so
-- nothing about what buyers see or can order changes until a number is typed.
-- AlterTable
ALTER TABLE "products" ADD COLUMN     "stockQty" INTEGER;
