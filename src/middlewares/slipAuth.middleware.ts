import { Request, Response, NextFunction } from 'express';
import { timingSafeEqual } from 'crypto';

/**
 * Static-key bearer auth for the taline → densis slip ingestion endpoint.
 *
 * Contract: `Authorization: Bearer <DENSIS_API_KEY>`. When `DENSIS_API_KEY` is empty/unset,
 * taline omits the header entirely and auth is disabled (open endpoint) — implement accordingly.
 *
 * This is intentionally separate from the app's JWT `requireAuth`: slips are machine-to-machine
 * ingestion authenticated by a shared static secret, not by a user session.
 */
export function slipAuth(req: Request, res: Response, next: NextFunction): void {
  const expected = process.env.DENSIS_API_KEY ?? '';

  // No key configured → auth disabled (per contract, taline sends no Authorization header).
  if (expected === '') {
    next();
    return;
  }

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Invalid bearer token', detail: 'Authorization header missing' });
    return;
  }

  const token = authHeader.slice(7);
  const provided = Buffer.from(token);
  const secret = Buffer.from(expected);
  // Constant-time compare; length is checked first because timingSafeEqual requires equal-length buffers.
  if (provided.length !== secret.length || !timingSafeEqual(provided, secret)) {
    res.status(401).json({ error: 'Invalid bearer token' });
    return;
  }

  next();
}
