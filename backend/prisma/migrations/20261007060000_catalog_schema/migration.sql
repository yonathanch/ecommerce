-- Create categories table
CREATE TABLE "categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- Create product_images table
CREATE TABLE "product_images" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "alt" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "product_images_pkey" PRIMARY KEY ("id")
);

-- Create product_variants table
CREATE TABLE "product_variants" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "options" JSONB NOT NULL,
    "price" DOUBLE PRECISION,
    "stock" INTEGER NOT NULL DEFAULT 0,
    "weight" DOUBLE PRECISION,
    "imageUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_variants_pkey" PRIMARY KEY ("id")
);

-- Unique indexes
CREATE UNIQUE INDEX "categories_name_key" ON "categories"("name");
CREATE UNIQUE INDEX "categories_slug_key" ON "categories"("slug");
CREATE UNIQUE INDEX "product_variants_sku_key" ON "product_variants"("sku");

-- Indexes (products_categoryId_idx created after the column exists, below)
CREATE INDEX "product_images_productId_idx" ON "product_images"("productId");
CREATE INDEX "product_variants_productId_idx" ON "product_variants"("productId");

-- Backfill: create a category for every distinct existing product.category value
INSERT INTO "categories" ("id", "name", "slug", "createdAt")
SELECT
    md5("category")::text,
    "category",
    lower(replace("category", ' ', '-')),
    CURRENT_TIMESTAMP
FROM "products"
WHERE "category" IS NOT NULL
GROUP BY "category";

-- Add categoryId as nullable first so existing rows can be backfilled
ALTER TABLE "products" ADD COLUMN "categoryId" TEXT;

UPDATE "products" p
SET "categoryId" = c."id"
FROM "categories" c
WHERE c."name" = p."category";

-- Any product still without a category gets an Uncategorized entry
INSERT INTO "categories" ("id", "name", "slug", "createdAt")
SELECT 'uncategorized', 'Uncategorized', 'uncategorized', CURRENT_TIMESTAMP
ON CONFLICT DO NOTHING;

UPDATE "products" SET "categoryId" = 'uncategorized' WHERE "categoryId" IS NULL;

-- Now enforce NOT NULL and foreign key
ALTER TABLE "products" ALTER COLUMN "categoryId" SET NOT NULL;

CREATE INDEX "products_categoryId_idx" ON "products"("categoryId");

ALTER TABLE "products"
    ADD CONSTRAINT "products_categoryId_fkey"
    FOREIGN KEY ("categoryId") REFERENCES "categories"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- Drop the old denormalized column
ALTER TABLE "products" DROP COLUMN "category";

-- Foreign keys for new tables
ALTER TABLE "product_images"
    ADD CONSTRAINT "product_images_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "products"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "product_variants"
    ADD CONSTRAINT "product_variants_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "products"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
