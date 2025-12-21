import { Router } from 'express';
import stockRoutes from './stockRoutes';
import dashboardRoutes from './dashboardRoutes';

const router = Router();

router.use('/stock', stockRoutes);
router.use('/', dashboardRoutes);

export default router;

