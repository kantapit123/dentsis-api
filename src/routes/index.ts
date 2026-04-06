import { Router } from 'express';
import stockRoutes from './stockRoutes';
import dashboardRoutes from './dashboardRoutes';
import patientRoutes from './patientRoutes';

const router = Router();

router.use('/stock', stockRoutes);
router.use('/patients', patientRoutes);
router.use('/', dashboardRoutes);

export default router;

