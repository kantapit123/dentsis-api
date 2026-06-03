import { Router } from 'express';
import {
  listTreatmentTypesHandler,
  createTreatmentTypeHandler,
  updateTreatmentTypeHandler,
  deleteTreatmentTypeHandler,
} from '../controllers/treatmentTypeController';
import { requireAuth, requireRole } from '../middlewares/auth.middleware';

const router = Router();

router.use(requireAuth);

// All authenticated roles can read treatment types.
router.get('/', listTreatmentTypesHandler);

// Mutations are ADMIN-only.
router.post('/', requireRole('ADMIN'), createTreatmentTypeHandler);
router.put('/:id', requireRole('ADMIN'), updateTreatmentTypeHandler);
router.delete('/:id', requireRole('ADMIN'), deleteTreatmentTypeHandler);

export default router;
