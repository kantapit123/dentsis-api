-- CreateTable
CREATE TABLE "income_guarantees" (
    "id" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "dailyAmount" DECIMAL(10,2) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "income_guarantees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "doctor_work_days" (
    "id" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "workDate" DATE NOT NULL,
    "startTime" TEXT,
    "endTime" TEXT,
    "dayFraction" DECIMAL(3,2) NOT NULL DEFAULT 1.00,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "doctor_work_days_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "income_guarantees_doctorId_idx" ON "income_guarantees"("doctorId");

-- CreateIndex
CREATE INDEX "doctor_work_days_workDate_idx" ON "doctor_work_days"("workDate");

-- CreateIndex
CREATE INDEX "doctor_work_days_doctorId_workDate_idx" ON "doctor_work_days"("doctorId", "workDate");

-- CreateIndex
CREATE UNIQUE INDEX "doctor_work_days_doctorId_workDate_key" ON "doctor_work_days"("doctorId", "workDate");

-- AddForeignKey
ALTER TABLE "income_guarantees" ADD CONSTRAINT "income_guarantees_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "doctors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doctor_work_days" ADD CONSTRAINT "doctor_work_days_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "doctors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
