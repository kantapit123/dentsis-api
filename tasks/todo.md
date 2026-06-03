# Finance & DF Module — Implementation

Plan: `~/.claude/plans/plan-cached-duckling.md`
Decisions (defaults applied): D1 match-repo body (`{ entity }` / `{ code,message }`),
D2 Decimal→number in responses, D3 manual validation, D4 email identity.

## Build steps
- [x] 1. Schema: extend User (doctorId, active), add DOCTOR enum, add Doctor/TreatmentType/DfRule/DailyRecord + enums
- [x] 1b. Migration `20260602232625_add_finance_and_role_models` + partial unique index (df_rules WHERE active, NULLS NOT DISTINCT)
- [x] 2. Auth touch-ups: requireAuth select+set doctorId/active + reject inactive; AuthUser/UserResponse extend; login/me return doctorId
- [x] 3. Users: extend createUser (doctorId+role validation+active); add GET/PUT/DELETE; add PUT /auth/password
- [x] 4. Master data: Doctor + TreatmentType CRUD
- [x] 5. DfRule CRUD + dfCalculatorService (Decimal) + 10 unit tests + /df-rules/preview
- [x] 6. DailyRecord CRUD (Decimal, snapshot, sequenceNo P2002 retry, TZ dates)
- [x] 7. Finance summary (daily/monthly, DOCTOR self-filter)
- [x] 8. Seed additions (doctor, doctor user dr.chanaporn, 6 treatment types, 50% default rule)
- [x] 9. Register routes in src/routes/index.ts
- [x] 10. Manual curl pass + role matrix (18 checks) — all green

## Review

**Done.** ~16 new files + 9 modified. `tsc` clean. dfCalculator tests 10/10. Migration applied,
seed run, server smoke-tested end-to-end.

Verified live (admin + dr.chanaporn):
- DF calc: preview 50% of 2000 = 1000; record treatmentFee 800 → df 400; snapshot captured.
- Summary: daily 2026-05-22 revenue 800 / df 400 / net 400.
- Roles: DOCTOR create record 403, /users 403, list ignores `?doctorId=other` (own only), no-token 401.
- Validation: DOCTOR_REQUIRED, DOCTOR_NOT_ALLOWED, DOCTOR_ALREADY_LINKED, FUTURE_DATE,
  INVALID_DF_VALUE, DUPLICATE_ACTIVE_RULE, INVALID_AMOUNT all enforced.
- Regression: /api/stock/logs 200, /api/products 200 under JWT.
- Partial unique index present in DB.

**Deviations from original prompt (per approved plan):** auth reused existing JWT (`requireAuth`/
`requireRole`), not rebuilt; User model extended not recreated; identity = email not username;
JWT secret = existing `JWT_ACCESS_SECRET`; responses use `{ entity }`/`{ code,message }` not `{ data }`
(summaries/preview keep `{ data }`); money Decimal→number in responses.

**Pre-existing (NOT introduced):** patientService + productListService test suites fail (4 tests) on
clean tree — verified via stash. `/api/patients` has no GET route (404).

**Manual follow-up:** change seeded passwords (admin / dr.chanaporn = `P@ssw0rd`).
`.env` already has `JWT_ACCESS_SECRET` — no new env var needed.

---

# Income Guarantee (ประกันรายได้) + Attendance

Plan: `~/.claude/plans/plan-admin-scalable-hummingbird.md` · Repo: `plans/income-guarantee.md`
Decisions: D1 per-day eval · D2 time-based fraction (clinic 11:00–20:00=540min) · D3 separate model ·
D4 work-day row = authoritative attendance (paid zero-patient day).

## Build steps
- [x] 1. Schema: `IncomeGuarantee` + `DoctorWorkDay` + Doctor back-relations
- [x] 1b. Migration `20260603062801_add_income_guarantee_and_workday` + hand-written partial unique index
  migration `20260603063000_..._active_unique_index` (income_guarantees WHERE active)
- [x] 2. Pure `guaranteeCalculatorService` (parseHHMM / computeDayFraction / computeTopUp) + 14 unit tests
- [x] 3. `incomeGuaranteeService` (CRUD, one-active-per-doctor) + `workDayService` (upsert by doctor+date, time→fraction)
- [x] 4. Controllers + routes: `/api/income-guarantees` (ADMIN), `/api/work-days` (ADMIN+STAFF); mounted
- [x] 5. Finance summary: per-doctor topUp/guaranteedFloor/guaranteedDf/daysWorked/dayFraction + totals
  (totalTopUp/totalGuaranteedDf/netRevenueAfterGuarantee); union work-day doctors (D4); old fields kept
- [x] 6. Docs: `contact/api-spec.md`, `roadmap/roadmap.md`, `plans/income-guarantee.md`
- [x] 7. Verify: `tsc` clean, calc tests 14/14, migration applied, partial unique index confirmed in DB

## Review

**Done (backend).** 8 new files + 4 modified (schema, financeSummaryService, routes/index, contact/roadmap).
`yarn build` clean. `guaranteeCalculatorService` 14/14 green; `dfCalculatorService` still green.
Migrations applied to dev DB; `income_guarantees_active_doctor_uq ... WHERE (active = true)` verified via pg_indexes.

**Key design:** top-up is a reporting value in `financeSummaryService` — never mutates `DailyRecord.dfAmount`.
Worked day = ≥1 DailyRecord OR a DoctorWorkDay row; absence ⇒ full day (1.0). Per-day evaluation (D1):
monthly = Σ per-day top-ups. dayFraction from check-in/out vs 540-min clinic day, clamped to [0,1].

**Not done:** live HTTP/curl smoke test (needs server boot + ADMIN token) — left as manual step in plan.
Frontend (admin guarantee CRUD, attendance entry, summary display) — separate task for dentsis-web.

**Pre-existing (NOT introduced):** patientService (date-bound age test, today≠2026-04-06) +
productListService sort suites still fail (4 tests) — same as prior session's stash-verified baseline.
