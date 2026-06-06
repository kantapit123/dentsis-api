-- AlterTable
ALTER TABLE "patients" ADD COLUMN     "dn" TEXT,
ADD COLUMN     "note" TEXT,
ALTER COLUMN "titlePrefix" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "patients_dn_key" ON "patients"("dn");

-- CreateIndex
CREATE INDEX "patients_dn_idx" ON "patients"("dn");

-- CreateIndex
CREATE INDEX "daily_records_patientId_idx" ON "daily_records"("patientId");

-- AddForeignKey
ALTER TABLE "daily_records" ADD CONSTRAINT "daily_records_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE SET NULL ON UPDATE CASCADE;
