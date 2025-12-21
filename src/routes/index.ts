import { Router } from 'express';
import stockRoutes from './stockRoutes';

const router = Router();

router.use('/stock', stockRoutes);

export default router;

