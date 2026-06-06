-- DailyRecord: make treatment type multi-valued (informational tags; not used in DF calc).
-- daily_records.treatmentTypeId had NO foreign key (app-level validation only), so only the
-- column changes here.

-- 1. Add the new array column (NOT NULL, default empty array).
ALTER TABLE "daily_records" ADD COLUMN "treatmentTypeIds" TEXT[] NOT NULL DEFAULT '{}';

-- 2. Backfill: existing single value becomes a one-element array.
UPDATE "daily_records"
SET "treatmentTypeIds" = ARRAY["treatmentTypeId"]
WHERE "treatmentTypeId" IS NOT NULL;

-- 3. Drop the old single-value column.
ALTER TABLE "daily_records" DROP COLUMN "treatmentTypeId";
