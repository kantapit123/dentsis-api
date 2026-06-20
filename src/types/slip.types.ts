// Wire contract for POST /api/slips — the taline slip-reader service.
// NOTE: this endpoint uses snake_case on the wire (taline's contract), unlike the rest of
// the API which is camelCase. The slip service/controller map to the camelCase Prisma model.

export type SlipConfidence = 'ok' | 'partial' | 'failed';

/**
 * Payload POSTed by taline after parsing a slip image.
 * Every field except `confidence` is optional/nullable — taline sends what it could extract.
 */
export interface SlipPayload {
  amount?: number | null; // transfer amount in THB; null if OCR failed
  transferred_at?: string | null; // ISO 8601, no tz — interpreted as Asia/Bangkok (+07:00)
  trans_ref?: string | null; // transaction reference from the slip's mini-QR; dedup key
  sending_bank?: string | null; // BOT 3-digit bank code, or "TrueMoney"
  confidence: SlipConfidence; // ok | partial | failed
  line_message_id?: string | null; // LINE message id of the source image; fallback dedup key
}

/** Saved slip returned after create (201) or on a dedup hit (200). */
export interface SlipRecord {
  id: string;
  amount: number | null;
  transferred_at: string | null; // echoed as naive Asia/Bangkok "YYYY-MM-DDTHH:mm:ss"
  trans_ref: string | null;
  sending_bank: string | null;
  confidence: SlipConfidence;
  line_message_id: string | null;
  created_at: string; // UTC ISO 8601, e.g. "2025-06-15T13:30:05.000Z"
}
