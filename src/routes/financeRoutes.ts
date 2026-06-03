import { Router } from 'express';
import { dailySummaryHandler, monthlySummaryHandler } from '../controllers/financeController';
import { requireAuth } from '../middlewares/auth.middleware';

const router = Router();

router.use(requireAuth);

// All roles can read summaries; DOCTOR is auto-scoped to their own figures in the controller.
router.get('/summary/daily', dailySummaryHandler);
router.get('/summary/monthly', monthlySummaryHandler);

export default router;
