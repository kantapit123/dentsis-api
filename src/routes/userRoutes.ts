import { Router } from 'express';
import {
  listUsersHandler,
  createUserHandler,
  updateUserHandler,
  deleteUserHandler,
} from '../controllers/authController';
import { requireAuth, requireRole } from '../middlewares/auth.middleware';

const router = Router();

// All user management is ADMIN-only.
router.use(requireAuth, requireRole('ADMIN'));

router.get('/', listUsersHandler);
router.post('/', createUserHandler);
router.put('/:id', updateUserHandler);
router.delete('/:id', deleteUserHandler);

export default router;
