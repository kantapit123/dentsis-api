-- One ACTIVE income guarantee per doctor. Prisma can't express a partial unique index in the schema
-- (WHERE active = true), so it is hand-written here — mirrors df_rules_active_doctor_treatment_uq.
-- Inactive (soft-deleted) rows are exempt, so guarantee history can accumulate per doctor.
CREATE UNIQUE INDEX "income_guarantees_active_doctor_uq"
  ON "income_guarantees" ("doctorId") WHERE "active" = true;
