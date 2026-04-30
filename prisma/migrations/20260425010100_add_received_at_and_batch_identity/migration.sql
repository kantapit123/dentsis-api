-- AlterTable
ALTER TABLE "stock_batches"
ADD COLUMN "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "stock_batches_productId_receivedAt_idx" ON "stock_batches"("productId", "receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "stock_batches_productId_lotNumber_expireDate_key" ON "stock_batches"("productId", "lotNumber", "expireDate");
