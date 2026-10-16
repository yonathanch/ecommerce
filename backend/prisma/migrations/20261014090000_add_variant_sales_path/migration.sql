-- Per-variant stock in the sales path.
--
-- Cart lines and stock holds become variant-aware: a shopper picking "Black / 42"
-- holds and buys that SKU's stock rather than the product-level total.
--
-- `variantSku` defaults to '' (not NULL) on purpose: the cart's uniqueness rule
-- has to MERGE two adds of the same line, and PostgreSQL treats NULLs as
-- distinct, so a nullable column would silently create duplicate rows.

-- AlterTable
ALTER TABLE "cart_items" ADD COLUMN "variantSku" TEXT NOT NULL DEFAULT '';

-- DropIndex
DROP INDEX "cart_items_cartId_productId_key";

-- CreateIndex
CREATE UNIQUE INDEX "cart_items_cartId_productId_variantSku_key" ON "cart_items"("cartId", "productId", "variantSku");

-- AlterTable
ALTER TABLE "stock_reservations" ADD COLUMN "variantSku" TEXT NOT NULL DEFAULT '';

-- CreateIndex
CREATE INDEX "stock_reservations_productId_variantSku_status_idx" ON "stock_reservations"("productId", "variantSku", "status");
