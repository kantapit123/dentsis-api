import { Router } from 'express';
import {
  listWorkSessionTypesHandler,
  createWorkSessionTypeHandler,
  updateWorkSessionTypeHandler,
  deleteWorkSessionTypeHandler,
} from '../controllers/workSessionTypeController';
import { requireAuth, requireRole } from '../middlewares/auth.middleware';

const router = Router();

router.use(requireAuth);

// Read: all authenticated roles
router.get('/', listWorkSessionTypesHandler);

// Mutations: ADMIN only
router.post('/', requireRole('ADMIN'), createWorkSessionTypeHandler);
router.put('/:id', requireRole('ADMIN'), updateWorkSessionTypeHandler);
router.delete('/:id', requireRole('ADMIN'), deleteWorkSessionTypeHandler);

export default router;
