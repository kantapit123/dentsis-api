import { Router, Request, Response } from 'express';
import { verifyLineSignature, handleLineEvents } from '../services/lineWebhookService';

const router = Router();

// POST /api/line/webhook — Line Messaging API webhook
// Requires express.raw({ type: 'application/json' }) mounted before this router (see index.ts).
router.post('/webhook', async (req: Request, res: Response): Promise<void> => {
  const signature = req.headers['x-line-signature'] as string;

  const rawBody = Buffer.isBuffer(req.body) ? req.body : undefined;

  if (!signature || !verifyLineSignature(rawBody, signature)) {
    res.status(401).json({ error: 'Invalid signature' });
    return;
  }

  let payload: { events: unknown[] };
  try {
    payload = JSON.parse((rawBody as Buffer).toString('utf8'));
  } catch {
    res.status(400).json({ error: 'Invalid JSON' });
    return;
  }

  // Respond 200 immediately — Line retries if we take >1s
  res.status(200).json({ ok: true });

  handleLineEvents(payload.events as Parameters<typeof handleLineEvents>[0]).catch(err =>
    console.error('handleLineEvents error:', err),
  );
});

export default router;
