import { Request, Response } from 'express';
import { createSlip, parseTransferredAt } from '../services/slipService';
import { SlipPayload, SlipConfidence } from '../types/slip.types';

const VALID_CONFIDENCE: SlipConfidence[] = ['ok', 'partial', 'failed'];

interface ValidationFailure {
  status: 400 | 422;
  body: { error: string; detail?: string };
}

/**
 * Validate a slip payload against the contract.
 *   400 — malformed / missing structural fields (non-object body, bad `confidence`).
 *   422 — a field is present but violates a value/length/format rule (e.g. negative amount).
 * Returns null when valid. Pure function so it is unit-testable without an HTTP layer.
 */
export function validateSlipPayload(body: unknown): ValidationFailure | null {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { status: 400, body: { error: 'Malformed request body', detail: 'Expected a JSON object' } };
  }
  const b = body as Record<string, unknown>;

  if (!VALID_CONFIDENCE.includes(b.confidence as SlipConfidence)) {
    return {
      status: 400,
      body: { error: 'Missing or invalid required field: confidence', detail: 'Must be one of: ok, partial, failed' },
    };
  }

  if (b.amount !== undefined && b.amount !== null) {
    if (typeof b.amount !== 'number' || !Number.isFinite(b.amount) || b.amount < 0) {
      return { status: 422, body: { error: 'amount must be a non-negative number' } };
    }
  }
  if (b.trans_ref !== undefined && b.trans_ref !== null) {
    if (typeof b.trans_ref !== 'string' || b.trans_ref.length > 64) {
      return { status: 422, body: { error: 'trans_ref must be a string of at most 64 characters' } };
    }
  }
  if (b.sending_bank !== undefined && b.sending_bank !== null) {
    if (typeof b.sending_bank !== 'string' || b.sending_bank.length > 32) {
      return { status: 422, body: { error: 'sending_bank must be a string of at most 32 characters' } };
    }
  }
  if (b.line_message_id !== undefined && b.line_message_id !== null) {
    if (typeof b.line_message_id !== 'string' || b.line_message_id.length > 64) {
      return { status: 422, body: { error: 'line_message_id must be a string of at most 64 characters' } };
    }
  }
  if (b.transferred_at !== undefined && b.transferred_at !== null) {
    if (typeof b.transferred_at !== 'string' || isNaN(parseTransferredAt(b.transferred_at).getTime())) {
      return { status: 422, body: { error: 'transferred_at must be a valid ISO 8601 datetime' } };
    }
  }
  return null;
}

/** POST /api/slips — receive a parsed slip from taline. 201 = new record, 200 = dedup hit. */
export async function createSlipHandler(req: Request, res: Response): Promise<void> {
  try {
    const failure = validateSlipPayload(req.body);
    if (failure) {
      res.status(failure.status).json(failure.body);
      return;
    }
    const { record, created } = await createSlip(req.body as SlipPayload);
    res.status(created ? 201 : 200).json(record);
  } catch (error) {
    console.error('Error creating slip:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
