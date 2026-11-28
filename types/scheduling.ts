export type Role = "patient" | "doctor" | "admin";

export interface Session {
  userId: string;
  role: Role;
  displayName: string;
}

export type BeneficiaryRelationship =
  | "self"
  | "child"
  | "parent"
  | "spouse"
  | "other";

export interface Beneficiary {
  id: string;
  accountHolderId: string;
  displayName: string;
  relationship: BeneficiaryRelationship;
  dob: string;
  gender: string;
  nationalId?: string;
  hospitalFileId?: string;
  /** Removed by the account holder; kept so past visits keep their name. */
  archived?: boolean;
}

export interface Doctor {
  id: string;
  name: string;
  department: string;
  specialty: string;
  /** The earliest session with places left, or null when none is open. */
  nextSession: NextOpenSession | null;
  isAcceptingBookings: boolean;
  bio?: string;
  yearsExperience?: number;
}

export interface NextOpenSession {
  sessionId: string;
  startsAt: string;
  endsAt: string;
  placesLeft: number;
}

/**
 * One doctor's stored settings (no derived availability). Unlike `Doctor`,
 * the booking flag and activation state are kept separate so admin screens
 * can show and toggle them independently.
 */
export interface DoctorDetail {
  id: string;
  name: string;
  department: string;
  specialty: string;
  /** Raw `doctors.is_accepting_bookings` flag. */
  acceptingBookingsFlag: boolean;
  /** `doctors.is_active` and the doctor's account (`profiles.is_active`). */
  isActive: boolean;
}

/** Doctor row for admin roster, including account activation state. */
export interface RosterDoctor extends Doctor {
  accountActive: boolean;
}

export type ClinicSessionStatus = "scheduled" | "cancelled";

/**
 * A clinic session: the doctor sees up to `capacity` patients between
 * `startsAt` and `endsAt`, first come, first served.
 */
export interface ClinicSession {
  id: string;
  doctorId: string;
  /** Local "yyyy-MM-dd". */
  dateYmd: string;
  startsAt: string;
  endsAt: string;
  capacity: number;
  bookedCount: number;
  placesLeft: number;
  status: ClinicSessionStatus;
  room?: string;
  cancelReason?: string;
  /** Scheduled, not yet ended, within the booking window and not full. */
  isBookable: boolean;
  /** Scheduled, not ended and within the booking window (may be full). */
  inBookingWindow: boolean;
  /** People on the waitlist for this session. */
  waitlistCount: number;
}

export type AppointmentType = "in-clinic" | "telehealth" | "home-visit";
export type AppointmentStatus = "upcoming" | "completed" | "cancelled" | "missed";

export type AppointmentDbStatus =
  | "pending"
  | "confirmed"
  | "cancelled"
  | "completed"
  | "no_show";

/** How a booking was made. */
export type AppointmentSource = "patient" | "waitlist" | "follow_up";

export interface Appointment {
  id: string;
  accountHolderId: string;
  beneficiaryId: string;
  doctorId: string;
  /** Clinic session; absent on bookings made before sessions existed. */
  sessionId?: string;
  /** Set when the whole session was cancelled (reason may be empty). */
  sessionCancelled?: { reason?: string };
  type: AppointmentType;
  status: AppointmentStatus;
  dbStatus: AppointmentDbStatus;
  startsAt?: string;
  endsAt?: string;
  room?: string;
  videoUrl?: string;
  address?: string;
  reason?: string;
  notes?: string;
  source: AppointmentSource;
  /** The visit this follow-up was booked from. */
  followUpOf?: string;
  /** Arrived at the clinic (ISO), with their place in the arrival order. */
  checkedInAt?: string;
  queueNumber?: number;
  /** Called in by the doctor (ISO). */
  calledAt?: string;
  finishedAt?: string;
}

/** Where a booked patient is on the day. */
export type VisitStage =
  | "booked"
  | "waiting"
  | "with-doctor"
  | "seen"
  | "no-show"
  | "cancelled";

/** A patient's live place in the clinic queue (get_queue_status). */
export interface QueueStatus {
  dbStatus: AppointmentDbStatus;
  checkedInAt?: string;
  queueNumber?: number;
  calledAt?: string;
  /** 1 = next in line; absent when not waiting. */
  position?: number;
  /** People checked in and not yet called. */
  waiting: number;
  /** Highest queue number called so far. */
  nowServing?: number;
}

/** Staff counts for one session (clinic_session_progress). */
export interface SessionProgress {
  sessionId: string;
  doctorId: string;
  dateYmd: string;
  startsAt: string;
  endsAt: string;
  capacity: number;
  room?: string;
  status: ClinicSessionStatus;
  booked: number;
  notArrived: number;
  waiting: number;
  withDoctor: number;
  seen: number;
  noShow: number;
  cancelled: number;
}

/** One of the signed-in patient's waitlist entries. */
export interface WaitlistEntry {
  id: string;
  sessionId: string;
  beneficiaryId: string;
  doctorId: string;
  startsAt: string;
  endsAt: string;
  room?: string;
  /** 1 = first to get a place that frees up. */
  position: number;
}

/** What a doctor sees about a booked patient (agenda "Patient details"). */
export interface PatientSummary {
  displayName: string;
  relationship: BeneficiaryRelationship;
  dob?: string;
  gender?: string;
  nationalId?: string;
  hospitalFileId?: string;
  /** Account holder (the person who booked). */
  holderName: string;
  holderPhone?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  /**
   * Health details from the account holder's profile. Only set when the
   * patient is the account holder ("self"); for family members the profile
   * describes someone else.
   */
  health?: {
    bloodType?: string;
    allergies?: string;
    medications?: string;
    conditions?: string;
    notes?: string;
  };
  /** Completed visits with this doctor, newest first (ISO dates). */
  previousVisitDates: string[];
  /** Visits with this doctor the patient didn't attend. */
  noShowCount: number;
}
