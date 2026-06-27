import { Router } from 'express';
import {
  listDoctorsHandler,
  createDoctorHandler,
  updateDoctorHandler,
  deleteDoctorHandler,
  generateInviteCodeHandler,
} from '../controllers/doctorController';
import { requireAuth, requireRole } from '../middlewares/auth.middleware';
import doctorSessionRateRoutes from './doctorSessionRateRoutes';

const router = Router();

router.use(requireAuth);

// All authenticated roles can read doctors (DOCTOR needs the list to render names).
router.get('/', listDoctorsHandler);

// Mutations are ADMIN-only.
router.post('/', requireRole('ADMIN'), createDoctorHandler);
router.put('/:id', requireRole('ADMIN'), updateDoctorHandler);
router.delete('/:id', requireRole('ADMIN'), deleteDoctorHandler);
router.post('/:id/invite-code', requireRole('ADMIN'), generateInviteCodeHandler);

// Per-doctor session rate history (sub-router, mergeParams enabled in the route file)
router.use('/:doctorId/session-rates', doctorSessionRateRoutes);

export default router;
