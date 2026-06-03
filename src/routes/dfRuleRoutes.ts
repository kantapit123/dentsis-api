import { Router } from 'express';
import {
  listDfRulesHandler,
  createDfRuleHandler,
  updateDfRuleHandler,
  deleteDfRuleHandler,
  previewDfHandler,
} from '../controllers/dfRuleController';
import { requireAuth, requireRole } from '../middlewares/auth.middleware';

const router = Router();

router.use(requireAuth);

// Read: all roles (DOCTOR is auto-filtered to own rules in the controller).
router.get('/', listDfRulesHandler);

// Preview: data-entry roles only (DOCTOR doesn't enter records).
router.post('/preview', requireRole('ADMIN', 'STAFF'), previewDfHandler);

// Mutations: ADMIN only.
router.post('/', requireRole('ADMIN'), createDfRuleHandler);
router.put('/:id', requireRole('ADMIN'), updateDfRuleHandler);
router.delete('/:id', requireRole('ADMIN'), deleteDfRuleHandler);

export default router;
