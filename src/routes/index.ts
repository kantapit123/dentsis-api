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
import slipRoutes from './slipRoutes';
import appointmentRoutes from './appointmentRoutes';
import featureRoutes from './featureRoutes';

const router = Router();

// Public — no auth required; returns enabled feature flags from env vars
router.use('/features', featureRoutes);

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

// Slip Receiver — taline slip ingestion (static-key bearer auth, not JWT)
// Controlled by FEATURE_SLIP_RECEIVER env var
if (process.env.FEATURE_SLIP_RECEIVER === 'true') {
  router.use('/slips', slipRoutes);
  console.log('[feature] slip-receiver: enabled');
} else {
  console.log('[feature] slip-receiver: disabled (set FEATURE_SLIP_RECEIVER=true to enable)');
}

// Appointments — calendar & booking system
// Controlled by FEATURE_APPOINTMENTS env var
if (process.env.FEATURE_APPOINTMENTS === 'true') {
  router.use('/appointments', appointmentRoutes);
  console.log('[feature] appointments: enabled');
} else {
  console.log('[feature] appointments: disabled (set FEATURE_APPOINTMENTS=true to enable)');
}

router.use('/', dashboardRoutes);

export default router;
