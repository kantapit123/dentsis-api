import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import {
  bootstrapHandler,
  loginHandler,
  refreshHandler,
  logoutHandler,
  meHandler,
  changePasswordHandler,
  createUserHandler,
} from '../controllers/authController';
import { requireAuth, requireRole } from '../middlewares/auth.middleware';

const router = Router();

const strictLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { code: 'TOO_MANY_REQUESTS', message: 'Too many requests, please try again later' },
});

router.post('/bootstrap', strictLimit, bootstrapHandler);
router.post('/login', strictLimit, loginHandler);
router.post('/refresh', refreshHandler);
router.post('/logout', logoutHandler);
router.get('/me', requireAuth, meHandler);
router.put('/password', requireAuth, changePasswordHandler);
// Legacy admin user-create path; full user CRUD lives at /api/users (see userRoutes).
router.post('/users', requireAuth, requireRole('ADMIN'), createUserHandler);

export default router;
