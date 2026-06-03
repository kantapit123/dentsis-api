import { Router } from 'express';
import {
  listDailyRecordsHandler,
  getDailyRecordHandler,
  createDailyRecordHandler,
  updateDailyRecordHandler,
  deleteDailyRecordHandler,
} from '../controllers/dailyRecordController';
import { requireAuth, requireRole } from '../middlewares/auth.middleware';

const router = Router();

router.use(requireAuth);

// Read: all roles (DOCTOR is scoped to own records in the controller).
router.get('/', listDailyRecordsHandler);
router.get('/:id', getDailyRecordHandler);

// Data entry: ADMIN + STAFF only (DOCTOR is read-only).
router.post('/', requireRole('ADMIN', 'STAFF'), createDailyRecordHandler);
router.put('/:id', requireRole('ADMIN', 'STAFF'), updateDailyRecordHandler);
router.delete('/:id', requireRole('ADMIN', 'STAFF'), deleteDailyRecordHandler);

export default router;
