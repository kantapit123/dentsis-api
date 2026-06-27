import { Router } from 'express';
import {
  listRatesHandler,
  createRateHandler,
  updateRateHandler,
  deleteRateHandler,
} from '../controllers/doctorSessionRateController';
import { requireAuth, requireRole } from '../middlewares/auth.middleware';

// Note: this router is mounted at /doctors/:doctorId/session-rates
// Express mergeParams: true is needed to access req.params.doctorId
const router = Router({ mergeParams: true });

router.use(requireAuth);

// Read: all authenticated roles
router.get('/', listRatesHandler);

// Mutations: ADMIN only
router.post('/', requireRole('ADMIN'), createRateHandler);
router.put('/:rateId', requireRole('ADMIN'), updateRateHandler);
router.delete('/:rateId', requireRole('ADMIN'), deleteRateHandler);

export default router;
