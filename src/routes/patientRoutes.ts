import { Router } from 'express';
import { requireAuth } from '../middlewares/auth.middleware';
import { createPatientHandler } from '../controllers/patientController';

const router = Router();

router.post('/', requireAuth, createPatientHandler);

export default router;
