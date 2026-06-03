-- CreateEnum
CREATE TYPE "DfType" AS ENUM ('PERCENTAGE', 'FIXED');

-- CreateEnum
CREATE TYPE "DfBase" AS ENUM ('TREATMENT_FEE', 'TOTAL_AMOUNT');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'TRANSFER');

-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'DOCTOR';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "doctorId" TEXT;

-- CreateTable
CREATE TABLE "doctors" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nickname" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "doctors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "treatment_types" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "defaultPrice" DECIMAL(10,2),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "treatment_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "df_rules" (
    "id" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "treatmentTypeId" TEXT,
    "dfType" "DfType" NOT NULL,
    "dfValue" DECIMAL(10,2) NOT NULL,
    "dfBase" "DfBase" NOT NULL DEFAULT 'TREATMENT_FEE',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "df_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_records" (
    "id" TEXT NOT NULL,
    "recordDate" DATE NOT NULL,
    "sequenceNo" INTEGER NOT NULL,
    "dn" TEXT,
    "patientId" TEXT,
    "patientName" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "treatmentNote" TEXT NOT NULL,
    "treatmentTypeId" TEXT,
    "treatmentFee" DECIMAL(10,2) NOT NULL,
    "medicineFee" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "medicineNote" TEXT,
    "totalAmount" DECIMAL(10,2) NOT NULL,
    "paymentMethod" "PaymentMethod" NOT NULL,
    "dfAmount" DECIMAL(10,2) NOT NULL,
    "dfRuleSnapshot" JSONB,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "daily_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "doctors_active_idx" ON "doctors"("active");

-- CreateIndex
CREATE UNIQUE INDEX "treatment_types_name_key" ON "treatment_types"("name");

-- CreateIndex
CREATE INDEX "df_rules_doctorId_idx" ON "df_rules"("doctorId");

-- CreateIndex
CREATE INDEX "df_rules_doctorId_treatmentTypeId_idx" ON "df_rules"("doctorId", "treatmentTypeId");

-- CreateIndex
CREATE INDEX "daily_records_recordDate_idx" ON "daily_records"("recordDate");

-- CreateIndex
CREATE INDEX "daily_records_doctorId_idx" ON "daily_records"("doctorId");

-- CreateIndex
CREATE INDEX "daily_records_recordDate_doctorId_idx" ON "daily_records"("recordDate", "doctorId");

-- CreateIndex
CREATE UNIQUE INDEX "daily_records_recordDate_sequenceNo_key" ON "daily_records"("recordDate", "sequenceNo");

-- CreateIndex
CREATE UNIQUE INDEX "users_doctorId_key" ON "users"("doctorId");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "doctors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "df_rules" ADD CONSTRAINT "df_rules_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "doctors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "df_rules" ADD CONSTRAINT "df_rules_treatmentTypeId_fkey" FOREIGN KEY ("treatmentTypeId") REFERENCES "treatment_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_records" ADD CONSTRAINT "daily_records_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "doctors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_records" ADD CONSTRAINT "daily_records_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Partial unique index: at most ONE active DF rule per (doctor, treatmentType).
-- NULLS NOT DISTINCT (PG15+) also caps one active DEFAULT rule (treatmentTypeId IS NULL) per doctor.
-- A column-list @@unique cannot express partial/NULL-equal uniqueness, so it lives here.
CREATE UNIQUE INDEX "df_rules_active_doctor_treatment_uq"
  ON "df_rules" ("doctorId", "treatmentTypeId") NULLS NOT DISTINCT
  WHERE "active" = true;
