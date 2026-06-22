import { AppointmentConfirmationStatus, AppointmentStatus, UserRole } from '@prisma/client';
import { prisma } from '../prisma';
import { sendAppointmentConfirmed, sendAppointmentCancelled, sendAppointmentBooked, sendAppointmentRescheduled } from './lineNotificationService';

// HH:MM string → minutes since midnight
function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

// minutes since midnight → HH:MM string
function minutesToTime(m: number): string {
  const h = Math.floor(m / 60);
  const min = m % 60;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

function computeEndTime(startTime: string, durationMinutes: number): string {
  return minutesToTime(timeToMinutes(startTime) + durationMinutes);
}

// True when [aStart, aEnd) overlaps [bStart, bEnd)
function timesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return timeToMinutes(aStart) < timeToMinutes(bEnd) && timeToMinutes(aEnd) > timeToMinutes(bStart);
}

const APPOINTMENT_INCLUDE = {
  patient: { select: { id: true, dn: true, firstName: true, lastName: true } },
  doctor: { select: { id: true, name: true, nickname: true, color: true, specialty: true } },
  treatmentType: { select: { id: true, name: true, durationMinutes: true, color: true } },
} as const;

type AppointmentWithIncludes = {
  id: string;
  date: Date;
  startTime: string;
  endTime: string;
  status: AppointmentStatus;
  confirmationStatus: AppointmentConfirmationStatus;
  notes: string | null;
  createdAt: Date;
  patient: { id: string; dn: string | null; firstName: string; lastName: string };
  doctor: { id: string; name: string; nickname: string | null; color: string | null; specialty: string | null };
  treatmentType: { id: string; name: string; durationMinutes: number; color: string | null };
};

function toAppointmentItem(a: AppointmentWithIncludes) {
  return {
    id: a.id,
    patient: {
      id: a.patient.id,
      dn: a.patient.dn,
      name: `${a.patient.firstName} ${a.patient.lastName}`,
    },
    doctor: {
      id: a.doctor.id,
      name: a.doctor.name,
      nickname: a.doctor.nickname,
      color: a.doctor.color,
      specialty: a.doctor.specialty,
    },
    treatmentType: {
      id: a.treatmentType.id,
      name: a.treatmentType.name,
      durationMinutes: a.treatmentType.durationMinutes,
      color: a.treatmentType.color,
    },
    date: (a.date as Date).toISOString().slice(0, 10),
    startTime: a.startTime,
    endTime: a.endTime,
    status: a.status,
    confirmationStatus: a.confirmationStatus,
    notes: a.notes ?? '',
    createdAt: a.createdAt.toISOString(),
  };
}

// ── List ──────────────────────────────────────────────────────────────────────

export async function listAppointments(
  from: string,
  to: string,
  doctorIds: string[] | undefined,
  statuses: AppointmentStatus[] | undefined,
  role: UserRole,
  userDoctorId: string | null,
) {
  const fromDate = new Date(from);
  const toDate = new Date(to);
  if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) throw new Error('INVALID_DATE');
  const diffDays = (toDate.getTime() - fromDate.getTime()) / 86400000;
  if (diffDays < 0) throw new Error('INVALID_RANGE');
  if (diffDays > 31) throw new Error('INVALID_RANGE');

  const effectiveDoctorIds = role === UserRole.DOCTOR && userDoctorId ? [userDoctorId] : doctorIds;
  const effectiveStatuses = statuses ?? [AppointmentStatus.SCHEDULED, AppointmentStatus.COMPLETED, AppointmentStatus.NO_SHOW];

  const appointments = await prisma.appointment.findMany({
    where: {
      date: { gte: fromDate, lte: toDate },
      ...(effectiveDoctorIds?.length ? { doctorId: { in: effectiveDoctorIds } } : {}),
      status: { in: effectiveStatuses },
    },
    include: APPOINTMENT_INCLUDE,
    orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
  });

  return { appointments: appointments.map(toAppointmentItem) };
}

// ── Confirmation Summary ──────────────────────────────────────────────────────

function currentWeekBounds(): { from: Date; to: Date } {
  const now = new Date();
  const day = now.getDay(); // 0=Sun
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((day + 6) % 7));
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  return { from: monday, to: sunday };
}

export async function getConfirmationSummary(
  from: string | undefined,
  to: string | undefined,
  role: UserRole,
  userDoctorId: string | null,
) {
  const bounds = currentWeekBounds();
  const fromDate = from ? new Date(from) : bounds.from;
  const toDate = to ? new Date(to) : bounds.to;

  const doctorFilter = role === UserRole.DOCTOR && userDoctorId ? { doctorId: userDoctorId } : {};

  const [waitingCall, confirmed] = await Promise.all([
    prisma.appointment.findMany({
      where: {
        ...doctorFilter,
        date: { gte: fromDate, lte: toDate },
        confirmationStatus: AppointmentConfirmationStatus.WAITING_CALL,
        status: AppointmentStatus.SCHEDULED,
      },
      include: APPOINTMENT_INCLUDE,
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
    }),
    prisma.appointment.findMany({
      where: {
        ...doctorFilter,
        date: { gte: fromDate, lte: toDate },
        confirmationStatus: AppointmentConfirmationStatus.CONFIRMED,
        status: AppointmentStatus.SCHEDULED,
      },
      include: APPOINTMENT_INCLUDE,
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
    }),
  ]);

  return {
    waitingCallCount: waitingCall.length,
    confirmedCount: confirmed.length,
    waitingCall: waitingCall.map(toAppointmentItem),
    confirmed: confirmed.map(toAppointmentItem),
  };
}

// ── Available Slots ───────────────────────────────────────────────────────────

const SLOT_START = 9 * 60;  // 09:00
const SLOT_END = 17 * 60 + 30; // 17:30
const SLOT_STEP = 30;

export async function getAvailableSlots(doctorId: string, date: string, durationMinutes: number) {
  const dateObj = new Date(date);
  if (isNaN(dateObj.getTime())) throw new Error('INVALID_DATE');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (dateObj < today) throw new Error('INVALID_DATE');

  const doctor = await prisma.doctor.findUnique({ where: { id: doctorId } });
  if (!doctor) throw new Error('DOCTOR_NOT_FOUND');

  const scheduled = await prisma.appointment.findMany({
    where: { doctorId, date: dateObj, status: AppointmentStatus.SCHEDULED },
    select: { startTime: true, endTime: true },
  });

  const slots: { time: string; available: boolean }[] = [];
  for (let t = SLOT_START; t <= SLOT_END; t += SLOT_STEP) {
    const slotStart = minutesToTime(t);
    const slotEnd = minutesToTime(t + durationMinutes);
    const available = !scheduled.some(s => timesOverlap(slotStart, slotEnd, s.startTime, s.endTime));
    slots.push({ time: slotStart, available });
  }

  return { slots };
}

// ── Doctors Availability ──────────────────────────────────────────────────────

export async function getDoctorsAvailability(date: string, treatmentTypeId: string | undefined) {
  const dateObj = new Date(date);
  if (isNaN(dateObj.getTime())) throw new Error('INVALID_DATE');

  let durationMinutes = 30;
  if (treatmentTypeId) {
    const tt = await prisma.treatmentType.findUnique({ where: { id: treatmentTypeId } });
    if (tt) durationMinutes = tt.durationMinutes;
  }

  const doctors = await prisma.doctor.findMany({
    where: { active: true },
    orderBy: { name: 'asc' },
  });

  const scheduledByDoctor = await prisma.appointment.groupBy({
    by: ['doctorId'],
    where: { date: dateObj, status: AppointmentStatus.SCHEDULED },
    _count: true,
  });
  const bookedCountMap = new Map(scheduledByDoctor.map(r => [r.doctorId, r._count]));

  const totalSlots = Math.floor((SLOT_END - SLOT_START) / SLOT_STEP) + 1;

  return {
    doctors: doctors.map(d => {
      const booked = bookedCountMap.get(d.id) ?? 0;
      const slotsUsed = booked * Math.ceil(durationMinutes / SLOT_STEP);
      const availableSlotCount = Math.max(0, totalSlots - slotsUsed);
      return {
        id: d.id,
        name: d.name,
        nickname: d.nickname,
        color: d.color,
        specialty: d.specialty,
        availableSlotCount,
      };
    }),
  };
}

// ── Get Single ────────────────────────────────────────────────────────────────

export async function getAppointment(id: string, role: UserRole, userDoctorId: string | null) {
  const appt = await prisma.appointment.findUnique({ where: { id }, include: APPOINTMENT_INCLUDE });
  if (!appt) throw new Error('APPOINTMENT_NOT_FOUND');
  if (role === UserRole.DOCTOR && userDoctorId && appt.doctorId !== userDoctorId) {
    throw new Error('FORBIDDEN');
  }
  return toAppointmentItem(appt);
}

// ── Create ────────────────────────────────────────────────────────────────────

export async function createAppointment(
  body: {
    patientId: string;
    doctorId: string;
    treatmentTypeId: string;
    date: string;
    startTime: string;
    notes?: string;
  },
  createdByUserId: string,
) {
  const patient = await prisma.patient.findUnique({ where: { id: body.patientId } });
  if (!patient) throw new Error('PATIENT_NOT_FOUND');

  const doctor = await prisma.doctor.findUnique({ where: { id: body.doctorId } });
  if (!doctor || !doctor.active) throw new Error('DOCTOR_NOT_FOUND');

  const treatmentType = await prisma.treatmentType.findUnique({ where: { id: body.treatmentTypeId } });
  if (!treatmentType) throw new Error('TREATMENT_TYPE_NOT_FOUND');

  const dateObj = new Date(body.date);
  if (isNaN(dateObj.getTime())) throw new Error('INVALID_DATE');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (dateObj < today) throw new Error('INVALID_DATE');

  const endTime = computeEndTime(body.startTime, treatmentType.durationMinutes);

  // Doctor overlap: find any SCHEDULED appt for this doctor on this date that overlaps
  const doctorAppts = await prisma.appointment.findMany({
    where: { doctorId: body.doctorId, date: dateObj, status: AppointmentStatus.SCHEDULED },
    select: { startTime: true, endTime: true },
  });
  if (doctorAppts.some(s => timesOverlap(body.startTime, endTime, s.startTime, s.endTime))) {
    throw new Error('SLOT_UNAVAILABLE');
  }

  // Patient double-book
  const patientAppts = await prisma.appointment.findMany({
    where: { patientId: body.patientId, date: dateObj, status: AppointmentStatus.SCHEDULED },
    select: { startTime: true, endTime: true },
  });
  if (patientAppts.some(s => timesOverlap(body.startTime, endTime, s.startTime, s.endTime))) {
    throw new Error('PATIENT_DOUBLE_BOOKED');
  }

  const appt = await prisma.appointment.create({
    data: {
      patientId: body.patientId,
      doctorId: body.doctorId,
      treatmentTypeId: body.treatmentTypeId,
      date: dateObj,
      startTime: body.startTime,
      endTime,
      notes: body.notes ?? null,
      createdByUserId,
    },
    include: APPOINTMENT_INCLUDE,
  });

  if (doctor.lineUserId) {
    sendAppointmentBooked({
      lineUserId: doctor.lineUserId,
      patientName: `${patient.firstName} ${patient.lastName}`,
      date: body.date,
      startTime: body.startTime,
      endTime,
      treatmentName: treatmentType.name,
    }).catch(err => console.error('Line booked noti failed:', err));
  }

  return toAppointmentItem(appt);
}

// ── Update ────────────────────────────────────────────────────────────────────

export async function updateAppointment(
  id: string,
  body: {
    date?: string;
    startTime?: string;
    treatmentTypeId?: string;
    doctorId?: string;
    notes?: string;
    status?: AppointmentStatus;
  },
) {
  const existing = await prisma.appointment.findUnique({
    where: { id },
    include: {
      treatmentType: true,
      doctor: { select: { lineUserId: true } },
      patient: { select: { firstName: true, lastName: true } },
    },
  });
  if (!existing) throw new Error('APPOINTMENT_NOT_FOUND');
  if (existing.status === AppointmentStatus.COMPLETED) throw new Error('CANNOT_MODIFY_COMPLETED');
  if (existing.status === AppointmentStatus.CANCELLED) throw new Error('CANNOT_MODIFY_CANCELLED');

  let treatmentType = existing.treatmentType;
  if (body.treatmentTypeId && body.treatmentTypeId !== existing.treatmentTypeId) {
    const tt = await prisma.treatmentType.findUnique({ where: { id: body.treatmentTypeId } });
    if (!tt) throw new Error('TREATMENT_TYPE_NOT_FOUND');
    treatmentType = tt;
  }

  if (body.doctorId && body.doctorId !== existing.doctorId) {
    const doc = await prisma.doctor.findUnique({ where: { id: body.doctorId } });
    if (!doc || !doc.active) throw new Error('DOCTOR_NOT_FOUND');
  }

  const scheduleChanged =
    body.date !== undefined ||
    body.startTime !== undefined ||
    body.treatmentTypeId !== undefined ||
    body.doctorId !== undefined;

  const newDate = body.date ? new Date(body.date) : existing.date;
  const newStartTime = body.startTime ?? existing.startTime;
  const newDoctorId = body.doctorId ?? existing.doctorId;
  const newEndTime = computeEndTime(newStartTime, treatmentType.durationMinutes);

  if (scheduleChanged) {
    const conflicts = await prisma.appointment.findMany({
      where: {
        id: { not: id },
        doctorId: newDoctorId,
        date: newDate,
        status: AppointmentStatus.SCHEDULED,
      },
      select: { startTime: true, endTime: true },
    });
    if (conflicts.some(s => timesOverlap(newStartTime, newEndTime, s.startTime, s.endTime))) {
      throw new Error('SLOT_UNAVAILABLE');
    }
  }

  const oldDate = (existing.date as Date).toISOString().slice(0, 10);
  const oldStartTime = existing.startTime;
  const oldEndTime = existing.endTime;

  const appt = await prisma.appointment.update({
    where: { id },
    data: {
      ...(body.date !== undefined ? { date: newDate } : {}),
      ...(body.startTime !== undefined ? { startTime: newStartTime, endTime: newEndTime } : {}),
      ...(body.treatmentTypeId !== undefined ? { treatmentTypeId: body.treatmentTypeId } : {}),
      ...(body.doctorId !== undefined ? { doctorId: body.doctorId } : {}),
      ...(body.notes !== undefined ? { notes: body.notes } : {}),
      ...(body.status !== undefined ? { status: body.status } : {}),
    },
    include: APPOINTMENT_INCLUDE,
  });

  if (scheduleChanged && existing.doctor.lineUserId) {
    sendAppointmentRescheduled({
      lineUserId: existing.doctor.lineUserId,
      patientName: `${existing.patient.firstName} ${existing.patient.lastName}`,
      date: body.date ?? oldDate,
      startTime: newStartTime,
      endTime: newEndTime,
      treatmentName: treatmentType.name,
      oldDate,
      oldStartTime,
      oldEndTime,
    }).catch(err => console.error('Line reschedule noti failed:', err));
  }

  return toAppointmentItem(appt);
}

// ── Confirm ───────────────────────────────────────────────────────────────────

export async function updateConfirmationStatus(id: string, confirmationStatus: AppointmentConfirmationStatus) {
  const existing = await prisma.appointment.findUnique({ where: { id } });
  if (!existing) throw new Error('APPOINTMENT_NOT_FOUND');
  await prisma.appointment.update({ where: { id }, data: { confirmationStatus } });

  if (confirmationStatus === AppointmentConfirmationStatus.CONFIRMED) {
    prisma.appointment.findUnique({
      where: { id },
      include: {
        patient: { select: { firstName: true, lastName: true } },
        doctor: { select: { lineUserId: true } },
        treatmentType: { select: { name: true } },
      },
    }).then(appt => {
      if (appt?.doctor.lineUserId) {
        return sendAppointmentConfirmed({
          lineUserId: appt.doctor.lineUserId,
          patientName: `${appt.patient.firstName} ${appt.patient.lastName}`,
          date: (appt.date as Date).toISOString().slice(0, 10),
          startTime: appt.startTime,
          endTime: appt.endTime,
          treatmentName: appt.treatmentType.name,
        });
      }
    }).catch(err => console.error('Line confirm noti failed:', err));
  }

  return { id, confirmationStatus };
}

// ── Cancel ────────────────────────────────────────────────────────────────────

export async function cancelAppointment(id: string, reason?: string) {
  const existing = await prisma.appointment.findUnique({
    where: { id },
    include: {
      patient: { select: { firstName: true, lastName: true } },
      doctor: { select: { lineUserId: true } },
      treatmentType: { select: { name: true } },
    },
  });
  if (!existing) throw new Error('APPOINTMENT_NOT_FOUND');
  if (existing.status === AppointmentStatus.COMPLETED) throw new Error('CANNOT_CANCEL_COMPLETED');
  if (existing.status === AppointmentStatus.CANCELLED) throw new Error('CANNOT_MODIFY_CANCELLED');

  await prisma.appointment.update({
    where: { id },
    data: { status: AppointmentStatus.CANCELLED, cancellationReason: reason ?? null },
  });

  if (existing.doctor.lineUserId) {
    sendAppointmentCancelled({
      lineUserId: existing.doctor.lineUserId,
      patientName: `${existing.patient.firstName} ${existing.patient.lastName}`,
      date: (existing.date as Date).toISOString().slice(0, 10),
      startTime: existing.startTime,
      endTime: existing.endTime,
      treatmentName: existing.treatmentType.name,
      reason,
    }).catch(err => console.error('Line cancel noti failed:', err));
  }
}
