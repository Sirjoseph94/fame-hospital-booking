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
  nextAvailable: string;
  isAcceptingBookings: boolean;
}

/** Doctor row for admin roster, including account activation state. */
export interface RosterDoctor extends Doctor {
  accountActive: boolean;
}

export type SlotStatus =
  | "available"
  | "held"
  | "booked"
  | "blackout";

export interface Slot {
  id: string;
  doctorId: string;
  startsAt: string;
  durationMin: number;
  status: SlotStatus;
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
  slotId: string;
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

export interface SlotHold {
  slotId: string;
  expiresAt: string;
}

export interface BlackoutRule {
  id: string;
  doctorId: string;
  startsAt: string;
  endsAt: string;
  reason: string;
  setBy: "doctor" | "admin";
}
