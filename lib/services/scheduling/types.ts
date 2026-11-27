import type {
  Appointment,
  Beneficiary,
  ClinicSession,
  Doctor,
  DoctorDetail,
  RosterDoctor,
} from "@/types/scheduling";

import type { SchedulingErrorCode } from "./errors";

export interface BookSessionInput {
  accountHolderId: string;
  beneficiaryId: string;
  sessionId: string;
  reason?: string;
  notes?: string;
}

export interface CreateSessionsInput {
  doctorId: string;
  /** Local "yyyy-MM-dd" of the first session. */
  firstDateYmd: string;
  /** 1 = just the weeks containing `firstDateYmd`'s matching weekdays. */
  weeks: number;
  /** 0 = Sunday … 6 = Saturday. */
  weekdays: number[];
  /** "HH:mm". */
  startTime: string;
  endTime: string;
  capacity: number;
}

export interface CreateSessionsResult {
  created: number;
  /** Dates skipped because they overlap an existing session or already ended. */
  skipped: number;
}

export interface CancelSessionResult {
  /** True when nobody had booked it, so it was deleted outright. */
  removed: boolean;
  cancelledBookings: number;
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

export interface DoctorAgendaVisitContext {
  beneficiaryName: string;
  accountHolderName: string;
  relationship: Beneficiary["relationship"];
  proxyTag?: string;
}

export type AppointmentListFilter = "all" | "today" | "upcoming" | "cancelled";

export interface AppointmentPageQuery {
  filter: AppointmentListFilter;
  /** Local "yyyy-MM-dd" used by the "today" and "upcoming" filters. */
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
  setDoctorAcceptingBookings(
    doctorId: string,
    isAcceptingBookings: boolean,
  ): Promise<DoctorDetail>;

  /** Upcoming sessions a patient can book (scheduled, not ended, not full). */
  listBookableSessions(doctorId: string): Promise<ClinicSession[]>;
  /** Every session (any status) for one doctor in an inclusive date range. */
  listDoctorSessions(
    doctorId: string,
    range: { fromYmd: string; toYmd: string },
  ): Promise<ClinicSession[]>;
  /** Every doctor's sessions on one day (admin capacity). */
  listSessionsOnDate(dateYmd: string): Promise<ClinicSession[]>;
  createSessions(input: CreateSessionsInput): Promise<CreateSessionsResult>;
  cancelSession(sessionId: string, reason?: string): Promise<CancelSessionResult>;

  /** Reserves a place in a session; confirmed immediately. */
  bookSession(input: BookSessionInput): Promise<Appointment>;
  /** Moves a booking to another session with the same doctor. */
  moveBooking(appointmentId: string, newSessionId: string): Promise<Appointment>;
  listAppointments(accountHolderId: string): Promise<Appointment[]>;
  /** A doctor's appointments, optionally limited to an inclusive date range. */
  listDoctorAppointments(
    doctorId: string,
    range?: { fromYmd: string; toYmd: string },
  ): Promise<Appointment[]>;
  enrichDoctorAgendaVisits(
    appointments: Appointment[],
  ): Promise<Map<string, DoctorAgendaVisitContext>>;
  completeDoctorAppointment(appointmentId: string): Promise<Appointment>;
  cancelAppointment(appointmentId: string): Promise<Appointment>;
  /** Admin: one page of appointments (newest first), filtered server-side. */
  listAppointmentsPage(query: AppointmentPageQuery): Promise<AppointmentPage>;

  injectNextFailure(code: SchedulingErrorCode): void;
}
