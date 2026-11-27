import type {
  Appointment,
  AppointmentType,
  Beneficiary,
  BlackoutRule,
  Doctor,
  DoctorDetail,
  RosterDoctor,
  Slot,
  SlotHold,
} from "@/types/scheduling";

import type { SchedulingErrorCode } from "./errors";

export interface ConfirmBookingInput {
  accountHolderId: string;
  beneficiaryId: string;
  doctorId: string;
  slotId: string;
  type: AppointmentType;
  hold: SlotHold;
  reason?: string;
  notes?: string;
  address?: string;
}

export interface ConfirmDoctorAppointmentInput {
  room?: string;
  videoUrl?: string;
}

export interface CreateBeneficiaryInput {
  accountHolderId: string;
  displayName: string;
  relationship: Beneficiary["relationship"];
  dob: string;
  gender: string;
  nationalId?: string;
  hospitalFileId?: string;
}

export interface SetBlackoutInput {
  doctorId: string;
  startsAt: string;
  endsAt: string;
  reason: string;
  setBy: BlackoutRule["setBy"];
}

export interface SetBlackoutResult {
  rule: BlackoutRule;
  /**
   * Booked visits inside the window. They are left booked (a blackout never
   * cancels a visit), so the caller should tell the user to handle them.
   */
  bookedVisitsInWindow: number;
}

export interface CreateAvailabilitySlotInput {
  doctorId: string;
  slotDate: string;
  startTime: string;
  endTime: string;
}

export interface SchedulingSettings {
  bufferMinutes: number;
}

export interface DoctorAgendaVisitContext {
  beneficiaryName: string;
  accountHolderName: string;
  relationship: Beneficiary["relationship"];
  proxyTag?: string;
}

export type AppointmentListFilter = "all" | "today" | "pending" | "confirmed";

export interface AppointmentPageQuery {
  filter: AppointmentListFilter;
  /** Local "yyyy-MM-dd" used by the "today" filter. */
  todayYmd: string;
  offset: number;
  limit: number;
}

export interface AppointmentPage {
  items: (Appointment & { doctorName: string })[];
  hasMore: boolean;
}

export interface SchedulingService {
  listBeneficiaries(accountHolderId: string): Promise<Beneficiary[]>;
  /** Creates the account holder's "self" beneficiary when missing and DOB/gender are available. */
  ensureSelfBeneficiary(accountHolderId: string): Promise<Beneficiary | null>;
  createBeneficiary(input: CreateBeneficiaryInput): Promise<Beneficiary>;
  listDoctors(): Promise<Doctor[]>;
  listDoctorsForAdmin(): Promise<RosterDoctor[]>;
  /** One doctor, including inactive ones (admin screens, schedule panel). */
  getDoctor(doctorId: string): Promise<DoctorDetail>;
  listSlots(doctorId: string): Promise<Slot[]>;
  holdSlot(slotId: string): Promise<SlotHold>;
  /** Clears the caller's hold and frees the slot when still held. Best-effort on sign-out. */
  releaseHold(slotId: string): Promise<void>;
  /** Returns a server-synced hold or throws if the client's hold is no longer valid. */
  syncBookingHold(slotId: string, hold: SlotHold): Promise<SlotHold>;
  confirmBooking(input: ConfirmBookingInput): Promise<Appointment>;
  listAppointments(accountHolderId: string): Promise<Appointment[]>;
  /** A doctor's appointments, optionally limited to an inclusive date range. */
  listDoctorAppointments(
    doctorId: string,
    range?: { fromYmd: string; toYmd: string },
  ): Promise<Appointment[]>;
  enrichDoctorAgendaVisits(
    appointments: Appointment[],
  ): Promise<Map<string, DoctorAgendaVisitContext>>;
  rescheduleAppointment(
    appointmentId: string,
    newSlotId: string,
    hold: SlotHold,
  ): Promise<Appointment>;
  confirmDoctorAppointment(
    appointmentId: string,
    input?: ConfirmDoctorAppointmentInput,
  ): Promise<Appointment>;
  completeDoctorAppointment(appointmentId: string): Promise<Appointment>;
  cancelAppointment(appointmentId: string): Promise<Appointment>;
  /** Admin: one page of appointments (newest first), filtered server-side. */
  listAppointmentsPage(query: AppointmentPageQuery): Promise<AppointmentPage>;
  setBlackout(input: SetBlackoutInput): Promise<SetBlackoutResult>;
  listBlackouts(doctorId: string): Promise<BlackoutRule[]>;
  deleteBlackout(blackoutId: string): Promise<void>;
  listSlotsOnDate(doctorId: string, dateYmd: string): Promise<Slot[]>;
  /** Same as listSlotsOnDate for several doctors in one round trip. */
  listSlotsOnDateForDoctors(
    doctorIds: string[],
    dateYmd: string,
  ): Promise<Map<string, Slot[]>>;
  listScheduleSlotsOnDate(doctorId: string, dateYmd: string): Promise<Slot[]>;
  createAvailabilitySlot(input: CreateAvailabilitySlotInput): Promise<Slot>;
  removeAvailabilitySlot(slotId: string): Promise<void>;
  setDoctorAcceptingBookings(
    doctorId: string,
    isAcceptingBookings: boolean,
  ): Promise<DoctorDetail>;
  getSettings(): Promise<SchedulingSettings>;
  updateBufferMinutes(minutes: number): Promise<SchedulingSettings>;
  injectNextFailure(code: SchedulingErrorCode): void;
}

// Dev-only fault injection (used by app/dev/kitchen-sink). Always inert in
