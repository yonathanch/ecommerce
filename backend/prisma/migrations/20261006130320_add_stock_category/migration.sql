-- AlterTable
ALTER TABLE "products" ADD COLUMN     "category" TEXT NOT NULL DEFAULT 'Uncategorized',
ADD COLUMN     "stock" INTEGER NOT NULL DEFAULT 0;
