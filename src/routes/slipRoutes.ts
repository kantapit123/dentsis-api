import { Router } from 'express';
import { createSlipHandler } from '../controllers/slipController';
import { slipAuth } from '../middlewares/slipAuth.middleware';

const router = Router();

// POST /api/slips — taline slip ingestion (static-key bearer auth; see slipAuth.middleware).
router.post('/', slipAuth, createSlipHandler);

export default router;
