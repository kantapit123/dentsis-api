-- CreateEnum
CREATE TYPE "PatientGender" AS ENUM ('MALE', 'FEMALE', 'OTHER');

-- CreateEnum
CREATE TYPE "PatientTitlePrefix" AS ENUM ('MISTER', 'MRS', 'MISS', 'YOUNG_BOY', 'YOUNG_GIRL', 'OTHER');

-- CreateTable
CREATE TABLE "patients" (
    "id" TEXT NOT NULL,
    "datestamp" TIMESTAMP(3) NOT NULL,
    "nationalId" TEXT NOT NULL,
    "titlePrefix" "PatientTitlePrefix" NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "dateOfBirth" TIMESTAMP(3) NOT NULL,
    "gender" "PatientGender" NOT NULL,
    "cardNo" TEXT,
    "address" TEXT,
    "photoBase64" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "patients_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "patients_nationalId_key" ON "patients"("nationalId");

-- CreateIndex
CREATE INDEX "patients_nationalId_idx" ON "patients"("nationalId");

-- CreateIndex
CREATE INDEX "patients_lastName_idx" ON "patients"("lastName");

-- CreateIndex
CREATE INDEX "patients_createdAt_idx" ON "patients"("createdAt");
