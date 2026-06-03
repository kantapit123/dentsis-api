import { Router } from 'express';
import stockRoutes from './stockRoutes';
import dashboardRoutes from './dashboardRoutes';
import patientRoutes from './patientRoutes';
import authRoutes from './authRoutes';
import userRoutes from './userRoutes';
import doctorRoutes from './doctorRoutes';
import treatmentTypeRoutes from './treatmentTypeRoutes';
import dfRuleRoutes from './dfRuleRoutes';
import dailyRecordRoutes from './dailyRecordRoutes';
import financeRoutes from './financeRoutes';
import incomeGuaranteeRoutes from './incomeGuaranteeRoutes';
import workDayRoutes from './workDayRoutes';

const router = Router();

router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/stock', stockRoutes);
router.use('/patients', patientRoutes);

// Finance & DF module
router.use('/doctors', doctorRoutes);
router.use('/treatment-types', treatmentTypeRoutes);
router.use('/df-rules', dfRuleRoutes);
router.use('/daily-records', dailyRecordRoutes);
router.use('/finance', financeRoutes);
router.use('/income-guarantees', incomeGuaranteeRoutes);
router.use('/work-days', workDayRoutes);

router.use('/', dashboardRoutes);

export default router;
