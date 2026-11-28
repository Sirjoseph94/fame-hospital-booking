import { addMinutes, parseISO } from "date-fns";

import type {
  Appointment,
  AppointmentDbStatus,
  AppointmentSource,
  AppointmentStatus,
  AppointmentType,
  Beneficiary,
  BeneficiaryRelationship,
  ClinicSession,
  ClinicSessionStatus,
  Doctor,
  DoctorDetail,
  NextOpenSession,
  RosterDoctor,
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
  archived_at?: string | null;
}

export interface DoctorRow {
  id: string;
  specialty: string;
  department: string;
  is_accepting_bookings: boolean;
  is_active: boolean;
  bio?: string | null;
  years_experience?: number | null;
  profile:
    | { full_name: string; is_active?: boolean }
    | { full_name: string; is_active?: boolean }[]
    | null;
}

/** A row of the clinic_session_availability view. */
export interface SessionAvailabilityRow {
  session_id: string;
  doctor_id: string;
  session_date: string;
  start_time: string;
  end_time: string;
  capacity: number;
  status: string;
  cancel_reason: string | null;
  booked_count: number;
  places_left: number;
  is_bookable: boolean;
  room: string | null;
  waitlist_count?: number | null;
  in_booking_window?: boolean | null;
}

/** A row of the doctor_next_open_session view. */
export interface NextOpenSessionRow {
  doctor_id: string;
  session_id: string;
  session_date: string;
  start_time: string;
  end_time: string;
  places_left: number;
}

type SessionTimes = {
  session_date: string;
  start_time: string;
  end_time: string;
  room?: string | null;
  cancel_reason?: string | null;
  status?: string;
};

export interface AppointmentRow {
  id: string;
  account_holder_id: string | null;
  beneficiary_id: string | null;
  patient_id: string;
  doctor_id: string;
  session_id: string | null;
  appointment_date: string;
  start_time: string;
  appointment_type: AppointmentType;
  status: string;
  room: string | null;
  video_url: string | null;
  address: string | null;
  reason: string | null;
  notes: string | null;
  source?: string | null;
  follow_up_of?: string | null;
  checked_in_at?: string | null;
  queue_number?: number | null;
  called_at?: string | null;
  finished_at?: string | null;
  session?: SessionTimes | SessionTimes[] | null;
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
    archived: Boolean(row.archived_at),
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

export function mapDoctor(
  row: DoctorRow,
  nextSession: NextOpenSession | null,
): Doctor {
  const accountActive = profileIsActive(row.profile);
  return {
    id: row.id,
    name: profileName(row.profile),
    department: row.department,
    specialty: row.specialty,
    nextSession,
    isAcceptingBookings:
      row.is_accepting_bookings && row.is_active && accountActive,
    bio: row.bio?.trim() || undefined,
    yearsExperience: row.years_experience ?? undefined,
  };
}

export function mapDoctorDetail(row: DoctorRow): DoctorDetail {
  return {
    id: row.id,
    name: profileName(row.profile),
    department: row.department,
    specialty: row.specialty,
    acceptingBookingsFlag: row.is_accepting_bookings,
    isActive: row.is_active !== false && profileIsActive(row.profile),
  };
}

export function mapRosterDoctor(
  row: DoctorRow,
  nextSession: NextOpenSession | null,
): RosterDoctor {
  const accountActive = profileIsActive(row.profile);
  return {
    ...mapDoctor(row, nextSession),
    accountActive,
  };
}

/**
 * Local wall-clock date + time from the database as an ISO instant. Dates and
 * times are stored without a zone and read in the device's zone, which is the
 * hospital's for patients and staff on site.
 */
export function localIso(dateYmd: string, time: string): string {
  const withSeconds = time.length === 5 ? `${time}:00` : time;
  return parseISO(`${dateYmd}T${withSeconds}`).toISOString();
}

export function mapNextOpenSession(row: NextOpenSessionRow): NextOpenSession {
  return {
    sessionId: row.session_id,
    startsAt: localIso(row.session_date, row.start_time),
    endsAt: localIso(row.session_date, row.end_time),
    placesLeft: row.places_left,
  };
}

function mapSessionStatus(status: string): ClinicSessionStatus {
  return status === "cancelled" ? "cancelled" : "scheduled";
}

export function mapSession(row: SessionAvailabilityRow): ClinicSession {
  return {
    id: row.session_id,
    doctorId: row.doctor_id,
    dateYmd: row.session_date,
    startsAt: localIso(row.session_date, row.start_time),
    endsAt: localIso(row.session_date, row.end_time),
    capacity: row.capacity,
    bookedCount: row.booked_count,
    placesLeft: row.places_left,
    status: mapSessionStatus(row.status),
    room: row.room ?? undefined,
    cancelReason: row.cancel_reason ?? undefined,
    isBookable: row.is_bookable,
    inBookingWindow: row.in_booking_window ?? row.is_bookable,
    waitlistCount: row.waitlist_count ?? 0,
  };
}

export function mapDbAppointmentStatus(status: string): AppointmentStatus {
  if (status === "completed") {
    return "completed";
  }
  if (status === "no_show") {
    return "missed";
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
    status === "completed" ||
    status === "no_show"
  ) {
    return status;
  }
  return "confirmed";
}

/** Visit window: the session's, or (older bookings) the stored start + 30 min. */
function appointmentWindow(row: AppointmentRow): { startsAt: string; endsAt: string } {
  const session = Array.isArray(row.session) ? row.session[0] : row.session;
  if (session) {
    return {
      startsAt: localIso(session.session_date, session.start_time),
      endsAt: localIso(session.session_date, session.end_time),
    };
  }
  const startsAt = localIso(row.appointment_date, row.start_time);
  return {
    startsAt,
    endsAt: addMinutes(parseISO(startsAt), 30).toISOString(),
  };
}

export function mapAppointment(row: AppointmentRow): Appointment {
  const { startsAt, endsAt } = appointmentWindow(row);
  const session = Array.isArray(row.session) ? row.session[0] : row.session;
  return {
    id: row.id,
    accountHolderId: row.account_holder_id ?? row.patient_id,
    beneficiaryId: row.beneficiary_id ?? row.patient_id,
    doctorId: row.doctor_id,
    sessionId: row.session_id ?? undefined,
    sessionCancelled:
      session?.status === "cancelled"
        ? { reason: session.cancel_reason?.trim() || undefined }
        : undefined,
    type: row.appointment_type,
    status: mapDbAppointmentStatus(row.status),
    dbStatus: mapDbStatus(row.status),
    startsAt,
    endsAt,
    room: row.room ?? session?.room ?? undefined,
    videoUrl: row.video_url ?? undefined,
    address: row.address ?? undefined,
    reason: row.reason ?? undefined,
    notes: row.notes ?? undefined,
    source: mapSource(row.source),
    followUpOf: row.follow_up_of ?? undefined,
    checkedInAt: row.checked_in_at ?? undefined,
    queueNumber: row.queue_number ?? undefined,
    calledAt: row.called_at ?? undefined,
    finishedAt: row.finished_at ?? undefined,
  };
}

function mapSource(source: string | null | undefined): AppointmentSource {
  return source === "waitlist" || source === "follow_up" ? source : "patient";
}
