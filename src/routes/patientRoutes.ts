import { Router } from 'express';
import { apiKeyGuard } from '../middlewares/apiKey.middleware';
import { createPatientHandler } from '../controllers/patientController';

const router = Router();

router.post('/', apiKeyGuard, createPatientHandler);

export default router;
