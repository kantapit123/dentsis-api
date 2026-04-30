-- AlterEnum
ALTER TYPE "StockMovementType" ADD VALUE 'DISPOSE';

-- AlterTable
ALTER TABLE "stock_movements"
ADD COLUMN "reason" TEXT;
