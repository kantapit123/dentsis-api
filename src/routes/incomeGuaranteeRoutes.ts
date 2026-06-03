import { Router } from 'express';
import {
  listIncomeGuaranteesHandler,
  createIncomeGuaranteeHandler,
  updateIncomeGuaranteeHandler,
  deleteIncomeGuaranteeHandler,
} from '../controllers/incomeGuaranteeController';
import { requireAuth, requireRole } from '../middlewares/auth.middleware';

const router = Router();

router.use(requireAuth);

// Read: all roles (DOCTOR is auto-filtered to own guarantee in the controller).
router.get('/', listIncomeGuaranteesHandler);

// Mutations: ADMIN only.
router.post('/', requireRole('ADMIN'), createIncomeGuaranteeHandler);
router.put('/:id', requireRole('ADMIN'), updateIncomeGuaranteeHandler);
router.delete('/:id', requireRole('ADMIN'), deleteIncomeGuaranteeHandler);

export default router;
