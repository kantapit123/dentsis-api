import { Router } from 'express';
import { requireAuth, requireRole } from '../middlewares/auth.middleware';
import {
  createPatientHandler,
  listPatientsHandler,
  getPatientHandler,
  getPatientByDnHandler,
  updatePatientHandler,
  deletePatientHandler,
} from '../controllers/patientController';

const router = Router();

router.use(requireAuth);

// Read: ADMIN + STAFF (DOCTOR is read-only on their own records and doesn't need the registry).
// `/by-dn/:dn` is declared before `/:id` so "by-dn" isn't captured as an id.
router.get('/', requireRole('ADMIN', 'STAFF'), listPatientsHandler);
router.get('/by-dn/:dn', requireRole('ADMIN', 'STAFF'), getPatientByDnHandler);
router.get('/:id', requireRole('ADMIN', 'STAFF'), getPatientHandler);

// Write: ADMIN + STAFF create/edit; delete is ADMIN-only.
router.post('/', requireRole('ADMIN', 'STAFF'), createPatientHandler);
router.put('/:id', requireRole('ADMIN', 'STAFF'), updatePatientHandler);
router.delete('/:id', requireRole('ADMIN'), deletePatientHandler);

export default router;
