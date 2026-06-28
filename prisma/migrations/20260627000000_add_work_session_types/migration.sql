-- CreateTable
CREATE TABLE "work_session_types" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "work_session_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "doctor_session_rates" (
    "id" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "workSessionTypeId" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "doctor_session_rates_pkey" PRIMARY KEY ("id")
);

-- AlterTable: nullable column — zero-downtime safe (no backfill, no default required)
ALTER TABLE "doctor_work_days" ADD COLUMN "workSessionTypeId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "work_session_types_name_key" ON "work_session_types"("name");

-- CreateIndex
CREATE INDEX "work_session_types_active_idx" ON "work_session_types"("active");

-- CreateIndex
CREATE INDEX "doctor_session_rates_doctorId_workSessionTypeId_effectiveFrom_idx" ON "doctor_session_rates"("doctorId", "workSessionTypeId", "effectiveFrom");

-- CreateIndex
CREATE INDEX "doctor_session_rates_doctorId_idx" ON "doctor_session_rates"("doctorId");

-- AddForeignKey
ALTER TABLE "doctor_session_rates" ADD CONSTRAINT "doctor_session_rates_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "doctors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doctor_session_rates" ADD CONSTRAINT "doctor_session_rates_workSessionTypeId_fkey" FOREIGN KEY ("workSessionTypeId") REFERENCES "work_session_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doctor_work_days" ADD CONSTRAINT "doctor_work_days_workSessionTypeId_fkey" FOREIGN KEY ("workSessionTypeId") REFERENCES "work_session_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;
