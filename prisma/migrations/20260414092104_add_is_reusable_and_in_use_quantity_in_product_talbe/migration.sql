-- AlterTable
ALTER TABLE "products" ADD COLUMN     "inUseQuantity" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "isReusable" BOOLEAN NOT NULL DEFAULT false;
