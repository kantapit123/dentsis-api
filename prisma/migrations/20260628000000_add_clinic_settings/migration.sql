CREATE TABLE "clinic_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "clinicOpenTime" TEXT NOT NULL DEFAULT '11:00',
    "clinicCloseTime" TEXT NOT NULL DEFAULT '20:00',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "clinic_settings_pkey" PRIMARY KEY ("id")
);

INSERT INTO "clinic_settings" ("id", "clinicOpenTime", "clinicCloseTime", "updatedAt")
VALUES (1, '11:00', '20:00', NOW());
