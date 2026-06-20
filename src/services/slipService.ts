import { Prisma } from '@prisma/client';
import { prisma } from '../prisma';
import { SlipPayload, SlipRecord } from '../types/slip.types';

const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;
const HAS_TZ = /[zZ]|[+-]\d{2}:\d{2}$/;

/**
 * Parse a slip datetime. The contract sends a naive ISO string (no timezone) that represents
 * Asia/Bangkok wall-clock time, so we append +07:00 before parsing. A tz/Z already present is respected.
 */
export function parseTransferredAt(value: string): Date {
  return new Date(HAS_TZ.test(value) ? value : `${value}+07:00`);
}

/**
 * Echo a stored UTC instant back as a naive Asia/Bangkok wall-clock string
 * ("YYYY-MM-DDTHH:mm:ss"), round-tripping the contract's transferred_at format.
 */
export function formatTransferredAt(date: Date): string {
  return new Date(date.getTime() + BANGKOK_OFFSET_MS).toISOString().slice(0, 19);
}

/** Map a Prisma Slip row (camelCase) to the snake_case wire record. */
export function formatSlipRecord(slip: {
  id: string;
  amount: Prisma.Decimal | null;
  transferredAt: Date | null;
  transRef: string | null;
  sendingBank: string | null;
  confidence: SlipRecord['confidence'];
  lineMessageId: string | null;
  createdAt: Date;
}): SlipRecord {
  return {
    id: slip.id,
    amount: slip.amount === null ? null : Number(slip.amount),
    transferred_at: slip.transferredAt ? formatTransferredAt(slip.transferredAt) : null,
    trans_ref: slip.transRef,
    sending_bank: slip.sendingBank,
    confidence: slip.confidence,
    line_message_id: slip.lineMessageId,
    created_at: slip.createdAt.toISOString(),
  };
}

export interface CreateSlipResult {
  record: SlipRecord;
  created: boolean; // true → 201 (new row); false → 200 (dedup hit)
}

/**
 * Persist a parsed slip with idempotency.
 * Dedup-key precedence: trans_ref (unique) → lineMessageId (when trans_ref is null) → none.
 * A duplicate returns the existing record (created: false); otherwise a new row (created: true).
 */
export async function createSlip(payload: SlipPayload): Promise<CreateSlipResult> {
  const transRef = payload.trans_ref?.trim() || null;
  const lineMessageId = payload.line_message_id ?? null;

  // Idempotency lookup before insert.
  const existing = transRef
    ? await prisma.slip.findUnique({ where: { transRef } })
    : lineMessageId
      ? await prisma.slip.findFirst({ where: { transRef: null, lineMessageId } })
      : null;
  if (existing) return { record: formatSlipRecord(existing), created: false };

  try {
    const slip = await prisma.slip.create({
      data: {
        amount: payload.amount ?? null,
        transferredAt: payload.transferred_at ? parseTransferredAt(payload.transferred_at) : null,
        transRef,
        sendingBank: payload.sending_bank ?? null,
        confidence: payload.confidence,
        lineMessageId,
      },
    });
    return { record: formatSlipRecord(slip), created: true };
  } catch (e) {
    // Concurrent insert with the same trans_ref → unique violation; treat as a dedup hit.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002' && transRef) {
      const dup = await prisma.slip.findUnique({ where: { transRef } });
      if (dup) return { record: formatSlipRecord(dup), created: false };
    }
    throw e;
  }
}
