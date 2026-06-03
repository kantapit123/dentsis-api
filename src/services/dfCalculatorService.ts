import { prisma } from '../prisma';
import { Prisma, DfRule } from '@prisma/client';
import { Decimal, round2 } from '../utils/money';

export interface DfCalcResult {
  dfAmount: Prisma.Decimal;
  ruleUsed: DfRule | null;
}

// Minimal shape needed to compute a DF amount — lets computeDf stay pure and unit-testable.
export interface DfRuleLike {
  dfType: 'PERCENTAGE' | 'FIXED';
  dfBase: 'TREATMENT_FEE' | 'TOTAL_AMOUNT';
  dfValue: Prisma.Decimal | number | string;
}

/**
 * Pure DF computation. Always Decimal math, rounded to 2 dp.
 *  - FIXED                       → dfValue (flat THB)
 *  - PERCENTAGE + TREATMENT_FEE  → treatmentFee * dfValue / 100
 *  - PERCENTAGE + TOTAL_AMOUNT   → (treatmentFee + medicineFee) * dfValue / 100
 */
export function computeDf(
  rule: DfRuleLike,
  treatmentFee: Prisma.Decimal,
  medicineFee: Prisma.Decimal,
): Prisma.Decimal {
  const value = new Decimal(rule.dfValue);

  if (rule.dfType === 'FIXED') {
    return round2(value);
  }

  const base = rule.dfBase === 'TOTAL_AMOUNT' ? treatmentFee.plus(medicineFee) : treatmentFee;
  return round2(base.times(value).div(100));
}

/**
 * Resolve the active DF rule for a doctor, with priority:
 *  1. doctor + treatmentType (specific override)
 *  2. doctor + treatmentType=null (doctor default)
 * Returns null when no active rule matches.
 */
export async function resolveRule(
  doctorId: string,
  treatmentTypeId: string | null,
): Promise<DfRule | null> {
  if (treatmentTypeId) {
    const specific = await prisma.dfRule.findFirst({
      where: { doctorId, treatmentTypeId, active: true },
    });
    if (specific) return specific;
  }

  const fallback = await prisma.dfRule.findFirst({
    where: { doctorId, treatmentTypeId: null, active: true },
  });
  return fallback;
}

/**
 * Calculate the DF for a record. Resolves the applicable rule then computes the amount.
 * No rule found → { dfAmount: 0, ruleUsed: null }.
 */
export async function calculateDf(
  doctorId: string,
  treatmentTypeId: string | null,
  treatmentFee: Prisma.Decimal,
  medicineFee: Prisma.Decimal,
): Promise<DfCalcResult> {
  const rule = await resolveRule(doctorId, treatmentTypeId);
  if (!rule) {
    return { dfAmount: new Decimal(0), ruleUsed: null };
  }
  return { dfAmount: computeDf(rule, treatmentFee, medicineFee), ruleUsed: rule };
}
