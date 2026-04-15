-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "StockMovementType" ADD VALUE 'WITHDRAW';
ALTER TYPE "StockMovementType" ADD VALUE 'DEPLETE';

-- AlterTable
ALTER TABLE "stock_movements" ALTER COLUMN "batchId" DROP NOT NULL,
ALTER COLUMN "lotNumber" DROP NOT NULL;
