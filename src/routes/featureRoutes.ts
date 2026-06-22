import { Router } from 'express';

const router = Router();

router.get('/', (_req, res) => {
  res.json({
    appointments: process.env.FEATURE_APPOINTMENTS === 'true',
    slipReceiver: process.env.FEATURE_SLIP_RECEIVER === 'true',
  });
});

export default router;
