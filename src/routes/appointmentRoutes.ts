import { Router } from 'express';
import { UserRole } from '@prisma/client';
import { requireAuth, requireRole } from '../middlewares/auth.middleware';
import {
  listAppointmentsHandler,
  getConfirmationSummaryHandler,
  getAvailableSlotsHandler,
  getDoctorsAvailabilityHandler,
  getAppointmentHandler,
  createAppointmentHandler,
  updateAppointmentHandler,
  updateConfirmationStatusHandler,
  cancelAppointmentHandler,
  cancelAppointmentByPostHandler,
} from '../controllers/appointmentController';

const router = Router();

// Specific sub-paths MUST come before /:id to avoid Express treating them as params
router.get('/confirmation-summary', requireAuth, getConfirmationSummaryHandler);
router.get('/available-slots', requireAuth, getAvailableSlotsHandler);
router.get('/doctors-availability', requireAuth, getDoctorsAvailabilityHandler);

router.get('/', requireAuth, listAppointmentsHandler);
router.get('/:id', requireAuth, getAppointmentHandler);

router.post('/', requireAuth, requireRole(UserRole.ADMIN, UserRole.STAFF), createAppointmentHandler);
router.post('/:id/cancel', requireAuth, requireRole(UserRole.ADMIN, UserRole.STAFF), cancelAppointmentByPostHandler);
router.patch('/:id/confirm', requireAuth, requireRole(UserRole.ADMIN, UserRole.STAFF), updateConfirmationStatusHandler);
router.patch('/:id', requireAuth, requireRole(UserRole.ADMIN, UserRole.STAFF), updateAppointmentHandler);
router.delete('/:id', requireAuth, requireRole(UserRole.ADMIN, UserRole.STAFF), cancelAppointmentHandler);

export default router;
