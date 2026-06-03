import { Router } from 'express';
import {
  listDoctorsHandler,
  createDoctorHandler,
  updateDoctorHandler,
  deleteDoctorHandler,
} from '../controllers/doctorController';
import { requireAuth, requireRole } from '../middlewares/auth.middleware';

const router = Router();

router.use(requireAuth);

// All authenticated roles can read doctors (DOCTOR needs the list to render names).
router.get('/', listDoctorsHandler);

// Mutations are ADMIN-only.
router.post('/', requireRole('ADMIN'), createDoctorHandler);
router.put('/:id', requireRole('ADMIN'), updateDoctorHandler);
router.delete('/:id', requireRole('ADMIN'), deleteDoctorHandler);

export default router;
