-- CreateEnum
CREATE TYPE "SlipConfidence" AS ENUM ('ok', 'partial', 'failed');

-- CreateTable
CREATE TABLE "slips" (
    "id" TEXT NOT NULL,
    "amount" DECIMAL(12,2),
    "transferredAt" TIMESTAMP(3),
    "transRef" TEXT,
    "sendingBank" TEXT,
    "confidence" "SlipConfidence" NOT NULL,
    "lineMessageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "slips_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "slips_transRef_key" ON "slips"("transRef");

-- CreateIndex
CREATE INDEX "slips_lineMessageId_idx" ON "slips"("lineMessageId");

-- CreateIndex
CREATE INDEX "slips_createdAt_idx" ON "slips"("createdAt");
