-- AlterTable
ALTER TABLE "orders" ADD COLUMN "courier" TEXT;
ALTER TABLE "orders" ADD COLUMN "trackingNumber" TEXT;
ALTER TABLE "orders" ADD COLUMN "shippedAt" TIMESTAMP(3);

-- Backfill. Orders that already left the warehouse have no timestamp, which
-- would make the fulfilment funnel non-monotonic (delivered > shipped) and
-- would hide the fact that they were shipped at all. `updatedAt` is the closest
-- honest approximation: it is when the status last moved.
UPDATE "orders" SET "shippedAt" = "updatedAt" WHERE "status" IN ('SHIPPED', 'DELIVERED');

-- CreateIndex
CREATE INDEX "orders_shippedAt_idx" ON "orders"("shippedAt");
