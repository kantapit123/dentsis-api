import { Router } from 'express';
import {
  listWorkDaysHandler,
  upsertWorkDayHandler,
  updateWorkDayHandler,
  deleteWorkDayHandler,
} from '../controllers/workDayController';
import { requireAuth, requireRole } from '../middlewares/auth.middleware';

const router = Router();

router.use(requireAuth);

// Read: all roles (DOCTOR is scoped to own work days in the controller).
router.get('/', listWorkDaysHandler);

// Data entry: ADMIN + STAFF only (DOCTOR is read-only).
router.post('/', requireRole('ADMIN', 'STAFF'), upsertWorkDayHandler);
router.put('/:id', requireRole('ADMIN', 'STAFF'), updateWorkDayHandler);
router.delete('/:id', requireRole('ADMIN', 'STAFF'), deleteWorkDayHandler);

export default router;
