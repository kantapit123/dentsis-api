import { Router } from 'express';
import { dailySummaryHandler, monthlySummaryHandler, periodSummaryHandler } from '../controllers/financeController';
import { requireAuth } from '../middlewares/auth.middleware';

const router = Router();

router.use(requireAuth);

// All roles can read summaries; DOCTOR is auto-scoped to their own figures in the controller.
router.get('/summary/daily', dailySummaryHandler);
router.get('/summary/monthly', monthlySummaryHandler);
router.get('/summary/range', periodSummaryHandler);

export default router;
