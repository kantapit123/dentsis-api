import { Router } from 'express';
import { getClinicSettingsHandler, updateClinicSettingsHandler } from '../controllers/clinicSettingController';
import { requireAuth, requireRole } from '../middlewares/auth.middleware';

const router = Router();

router.use(requireAuth);

router.get('/', getClinicSettingsHandler);
router.put('/', requireRole('ADMIN'), updateClinicSettingsHandler);

export default router;
