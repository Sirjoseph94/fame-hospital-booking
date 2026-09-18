import { addMinutes, differenceInMinutes, parseISO } from "date-fns";

import type {
  Appointment,
  AppointmentDbStatus,
  AppointmentStatus,
  AppointmentType,
  Beneficiary,
  BeneficiaryRelationship,
  BlackoutRule,
  Doctor,
  RosterDoctor,
  Slot,
  SlotStatus,
} from "@/types/scheduling";

export interface BeneficiaryRow {
  id: string;
  account_holder_id: string;
  display_name: string;
  relationship: BeneficiaryRelationship;
  dob: string;
  gender: string;
  national_id: string | null;
  hospital_file_id: string | null;
}

export interface DoctorRow {
  id: string;
  specialty: string;
  department: string;
  is_accepting_bookings: boolean;
  is_active: boolean;
  profile:
    | { full_name: string; is_active?: boolean }
    | { full_name: string; is_active?: boolean }[]
    | null;
}

export interface SlotRow {
  id: string;
  doctor_id: string;
  slot_date: string;
  start_time: string;
  end_time: string;
  status: string;
}

export interface AppointmentRow {
  id: string;
  account_holder_id: string | null;
  beneficiary_id: string | null;
  patient_id: string;
  doctor_id: string;
  slot_id: string | null;
  appointment_date: string;
  start_time: string;
  appointment_type: AppointmentType;
  status: string;
  room: string | null;
  video_url: string | null;
  address: string | null;
  reason: string | null;
  notes: string | null;
  appointment_slots?:
    | { slot_date: string; start_time: string; end_time: string }
    | { slot_date: string; start_time: string; end_time: string }[]
    | null;
}

export interface BlackoutRow {
  id: string;
  doctor_id: string;
  starts_at: string;
  ends_at: string;
  reason: string;
  set_by: BlackoutRule["setBy"];
}

export function mapBeneficiary(row: BeneficiaryRow): Beneficiary {
  return {
    id: row.id,
    accountHolderId: row.account_holder_id,
    displayName: row.display_name,
    relationship: row.relationship,
    dob: row.dob,
    gender: row.gender,
    nationalId: row.national_id ?? undefined,
    hospitalFileId: row.hospital_file_id ?? undefined,
  };
}

function profileName(
  profile: DoctorRow["profile"],
): string {
  if (!profile) {
    return "Doctor";
  }
  if (Array.isArray(profile)) {
    return profile[0]?.full_name ?? "Doctor";
  }
  return profile.full_name;
}

function profileIsActive(profile: DoctorRow["profile"]): boolean {
  if (!profile) {
    return true;
  }
  if (Array.isArray(profile)) {
    return profile[0]?.is_active !== false;
  }
  return profile.is_active !== false;
}

export function mapDoctor(row: DoctorRow, nextAvailable: string): Doctor {
  const accountActive = profileIsActive(row.profile);
  return {
    id: row.id,
    name: profileName(row.profile),
    department: row.department,
    specialty: row.specialty,
    nextAvailable,
    isAcceptingBookings:
      row.is_accepting_bookings && row.is_active && accountActive,
  };
}

export function mapRosterDoctor(
  row: DoctorRow,
  nextAvailable: string,
): RosterDoctor {
  const accountActive = profileIsActive(row.profile);
  return {
    ...mapDoctor(row, nextAvailable),
    accountActive,
  };
}

export function slotStartsAt(row: SlotRow): string {
  const time = row.start_time.length === 5 ? `${row.start_time}:00` : row.start_time;
  return parseISO(`${row.slot_date}T${time}`).toISOString();
}

export function slotDurationMin(row: SlotRow): number {
  const start = slotStartsAt(row);
  const endTime =
    row.end_time.length === 5 ? `${row.end_time}:00` : row.end_time;
  const end = parseISO(`${row.slot_date}T${endTime}`).toISOString();
  return Math.max(differenceInMinutes(parseISO(end), parseISO(start)), 15);
}

export function mapSlotStatus(dbStatus: string): SlotStatus {
  if (dbStatus === "blocked" || dbStatus === "blackout") {
    return "blackout";
  }
  if (
    dbStatus === "available" ||
    dbStatus === "held" ||
    dbStatus === "booked"
  ) {
    return dbStatus;
  }
  return "blackout";
}

export function mapSlot(row: SlotRow): Slot {
  return {
    id: row.id,
    doctorId: row.doctor_id,
    startsAt: slotStartsAt(row),
    durationMin: slotDurationMin(row),
    status: mapSlotStatus(row.status),
  };
}

export function mapDbAppointmentStatus(status: string): AppointmentStatus {
  if (status === "completed") {
    return "completed";
  }
  if (status === "cancelled") {
    return "cancelled";
  }
  return "upcoming";
}

function mapDbStatus(status: string): AppointmentDbStatus {
  if (
    status === "pending" ||
    status === "confirmed" ||
    status === "cancelled" ||
    status === "completed"
  ) {
    return status;
  }
  return "confirmed";
}

function slotTimingFromRow(
  row: AppointmentRow,
): { date: string; startTime: string; endTime?: string } {
  const slot = row.appointment_slots;
  const slotRow = Array.isArray(slot) ? slot[0] : slot;
  if (slotRow) {
    return {
      date: slotRow.slot_date,
      startTime: slotRow.start_time,
      endTime: slotRow.end_time,
    };
  }
  return {
    date: row.appointment_date,
    startTime: row.start_time,
  };
}

function appointmentStartsAt(row: AppointmentRow): string | undefined {
  const timing = slotTimingFromRow(row);
  const time =
    timing.startTime.length === 5
      ? `${timing.startTime}:00`
      : timing.startTime;
  return parseISO(`${timing.date}T${time}`).toISOString();
}

function appointmentEndsAt(row: AppointmentRow): string | undefined {
  const timing = slotTimingFromRow(row);
  const startTime =
    timing.startTime.length === 5
      ? `${timing.startTime}:00`
      : timing.startTime;
  const start = parseISO(`${timing.date}T${startTime}`);
  if (!timing.endTime) {
    return addMinutes(start, 30).toISOString();
  }
  const time =
    timing.endTime.length === 5 ? `${timing.endTime}:00` : timing.endTime;
  return parseISO(`${timing.date}T${time}`).toISOString();
}

export function mapAppointment(row: AppointmentRow): Appointment {
  const accountHolderId = row.account_holder_id ?? row.patient_id;
  const beneficiaryId = row.beneficiary_id ?? row.patient_id;
  if (!row.slot_id) {
    throw new Error("Appointment row is missing slot_id.");
  }

  return {
    id: row.id,
    accountHolderId,
    beneficiaryId,
    doctorId: row.doctor_id,
    slotId: row.slot_id,
    type: row.appointment_type,
    status: mapDbAppointmentStatus(row.status),
    dbStatus: mapDbStatus(row.status),
    startsAt: appointmentStartsAt(row),
    endsAt: appointmentEndsAt(row),
    room: row.room ?? undefined,
    videoUrl: row.video_url ?? undefined,
    address: row.address ?? undefined,
    reason: row.reason ?? undefined,
    notes: row.notes ?? undefined,
  };
}

export function mapBlackout(row: BlackoutRow): BlackoutRule {
  return {
    id: row.id,
    doctorId: row.doctor_id,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    reason: row.reason,
    setBy: row.set_by,
  };
}

export function toDbAppointmentStatus(status: AppointmentStatus): string {
  if (status === "completed") {
    return "completed";
  }
  if (status === "cancelled") {
    return "cancelled";
  }
  return "confirmed";
}

/** Marks slots unavailable when they fall inside a post-visit buffer window. */
export function applyBufferToSlots(
  slots: Slot[],
  bookedEndsAt: string[],
  bufferMinutes: number,
): Slot[] {
  if (bufferMinutes <= 0 || bookedEndsAt.length === 0) {
    return slots;
  }

  return slots.map((slot) => {
    if (slot.status !== "available") {
      return slot;
    }

    const slotStart = parseISO(slot.startsAt).getTime();
    const blocked = bookedEndsAt.some((endsAt) => {
      const bufferEnd = addMinutes(parseISO(endsAt), bufferMinutes).getTime();
      return slotStart >= parseISO(endsAt).getTime() && slotStart < bufferEnd;
    });

    if (blocked) {
      return { ...slot, status: "blackout" as const };
    }
    return slot;
  });
}
