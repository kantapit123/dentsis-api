-- CreateTable
CREATE TABLE "doctor_invite_codes" (
    "id" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "doctor_invite_codes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "doctor_invite_codes_code_key" ON "doctor_invite_codes"("code");

-- CreateIndex
CREATE INDEX "doctor_invite_codes_doctorId_idx" ON "doctor_invite_codes"("doctorId");

-- CreateIndex
CREATE INDEX "doctor_invite_codes_code_idx" ON "doctor_invite_codes"("code");

-- AddForeignKey
ALTER TABLE "doctor_invite_codes" ADD CONSTRAINT "doctor_invite_codes_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "doctors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
