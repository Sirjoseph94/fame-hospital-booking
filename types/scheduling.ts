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
}

export interface Doctor {
  id: string;
  name: string;
  department: string;
  specialty: string;
  /** The earliest session with places left, or null when none is open. */
  nextSession: NextOpenSession | null;
  isAcceptingBookings: boolean;
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
  cancelReason?: string;
  /** Scheduled, not yet ended and not full. */
  isBookable: boolean;
}

export type AppointmentType = "in-clinic" | "telehealth" | "home-visit";
export type AppointmentStatus = "upcoming" | "completed" | "cancelled";

export type AppointmentDbStatus =
  | "pending"
  | "confirmed"
  | "cancelled"
  | "completed";

export interface Appointment {
  id: string;
  accountHolderId: string;
  beneficiaryId: string;
  doctorId: string;
  /** Clinic session; absent on bookings made before sessions existed. */
  sessionId?: string;
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
}
