import { validateSlipPayload } from '../slipController';

// validateSlipPayload is pure (no DB), but importing the controller pulls in the service →
// the Prisma singleton; stub it so no client is constructed during the test run.
jest.mock('../../prisma', () => ({ prisma: {} }));

describe('validateSlipPayload', () => {
  it('returns null for a valid full payload', () => {
    expect(
      validateSlipPayload({
        amount: 1500,
        transferred_at: '2025-06-15T20:30:00',
        trans_ref: 'REF20250615123456',
        sending_bank: '014',
        confidence: 'ok',
        line_message_id: '540b8cf799924ef7b60f206f4c9f2299',
      })
    ).toBeNull();
  });

  it('returns null for a valid partial payload (nulls allowed)', () => {
    expect(
      validateSlipPayload({
        amount: null,
        transferred_at: null,
        trans_ref: null,
        sending_bank: null,
        confidence: 'partial',
        line_message_id: 'abc',
      })
    ).toBeNull();
  });

  it('accepts confidence=failed defensively', () => {
    expect(validateSlipPayload({ confidence: 'failed' })).toBeNull();
  });

  it('400 when the body is not a JSON object', () => {
    expect(validateSlipPayload(null)?.status).toBe(400);
    expect(validateSlipPayload('x')?.status).toBe(400);
    expect(validateSlipPayload([])?.status).toBe(400);
  });

  it('400 when confidence is missing or invalid', () => {
    expect(validateSlipPayload({})?.status).toBe(400);
    expect(validateSlipPayload({ confidence: 'maybe' })?.status).toBe(400);
  });

  it('422 when amount is negative or not a number', () => {
    expect(validateSlipPayload({ confidence: 'ok', amount: -1 })?.status).toBe(422);
    expect(validateSlipPayload({ confidence: 'ok', amount: 'lots' })?.status).toBe(422);
  });

  it('422 when a string field exceeds its max length', () => {
    expect(validateSlipPayload({ confidence: 'ok', trans_ref: 'x'.repeat(65) })?.status).toBe(422);
    expect(validateSlipPayload({ confidence: 'ok', sending_bank: 'x'.repeat(33) })?.status).toBe(422);
    expect(validateSlipPayload({ confidence: 'ok', line_message_id: 'x'.repeat(65) })?.status).toBe(422);
  });

  it('422 when transferred_at is unparseable', () => {
    expect(validateSlipPayload({ confidence: 'ok', transferred_at: 'not-a-date' })?.status).toBe(422);
  });
});
