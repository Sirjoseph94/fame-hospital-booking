import { addMinutes, isBefore, parseISO } from "date-fns";

import { doctorProxyTag } from "@/lib/doctor-agenda-helpers";
import {
  holdDurationSeconds,
  schedulingLatencyMs,
} from "@/lib/scheduling-constants";
import {
  assertScheduleDateNotInPast,
  assertScheduleInstantNotInPast,
  todayYmdLocal,
} from "@/lib/scheduling-dates";
import { supabase } from "@/lib/supabase";
import type {
  Appointment,
  AppointmentType,
  Beneficiary,
  BlackoutRule,
  Doctor,
  RosterDoctor,
  Slot,
  SlotHold,
} from "@/types/scheduling";

import {
  applyBufferToSlots,
  mapAppointment,
  mapBeneficiary,
  mapBlackout,
  mapDoctor,
  mapRosterDoctor,
  mapSlot,
  slotDurationMin,
  slotStartsAt,
  toDbAppointmentStatus,
  type AppointmentRow,
  type BeneficiaryRow,
  type BlackoutRow,
  type DoctorRow,
  type SlotRow,
} from "@/lib/services/scheduling-mappers";

export type SchedulingErrorCode =
  | "SLOT_TAKEN"
  | "HOLD_EXPIRED"
  | "NETWORK_ERROR";

export class SchedulingError extends Error {
  constructor(
    public readonly code: SchedulingErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "SchedulingError";
  }
}

export interface ConfirmBookingInput {
  accountHolderId: string;
  beneficiaryId: string;
  doctorId: string;
  slotId: string;
  type: AppointmentType;
  hold: SlotHold;
  reason?: string;
  notes?: string;
  room?: string;
  videoUrl?: string;
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

export interface SchedulingService {
  listBeneficiaries(accountHolderId: string): Promise<Beneficiary[]>;
  /** Creates the account holder's "self" beneficiary when missing and DOB/gender are available. */
  ensureSelfBeneficiary(accountHolderId: string): Promise<Beneficiary | null>;
  createBeneficiary(input: CreateBeneficiaryInput): Promise<Beneficiary>;
  listDoctors(): Promise<Doctor[]>;
  listDoctorsForAdmin(): Promise<RosterDoctor[]>;
  listSlots(doctorId: string): Promise<Slot[]>;
  holdSlot(slotId: string): Promise<SlotHold>;
  /** Clears the caller's hold and frees the slot when still held. Best-effort on sign-out. */
  releaseHold(slotId: string): Promise<void>;
  /** Returns a server-synced hold or throws if the client's hold is no longer valid. */
  syncBookingHold(slotId: string, hold: SlotHold): Promise<SlotHold>;
  confirmBooking(input: ConfirmBookingInput): Promise<Appointment>;
  listAppointments(accountHolderId: string): Promise<Appointment[]>;
  listDoctorAppointments(doctorId: string): Promise<Appointment[]>;
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
  listAllAppointments(): Promise<Appointment[]>;
  setBlackout(input: SetBlackoutInput): Promise<BlackoutRule>;
  listBlackouts(doctorId: string): Promise<BlackoutRule[]>;
  deleteBlackout(blackoutId: string): Promise<void>;
  listSlotsOnDate(doctorId: string, dateYmd: string): Promise<Slot[]>;
  listScheduleSlotsOnDate(doctorId: string, dateYmd: string): Promise<Slot[]>;
  createAvailabilitySlot(input: CreateAvailabilitySlotInput): Promise<Slot>;
  removeAvailabilitySlot(slotId: string): Promise<void>;
  setDoctorAcceptingBookings(
    doctorId: string,
    isAcceptingBookings: boolean,
  ): Promise<Doctor>;
  getSettings(): Promise<SchedulingSettings>;
  updateBufferMinutes(minutes: number): Promise<SchedulingSettings>;
  injectNextFailure(code: SchedulingErrorCode): void;
}

let nextFailure: SchedulingErrorCode | null = null;

function wait(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, schedulingLatencyMs);
  });
}

function consumeFailure(expected?: SchedulingErrorCode): void {
  if (nextFailure === null || (expected && nextFailure !== expected)) {
    return;
  }

  const code = nextFailure;
  nextFailure = null;
  const messages: Record<SchedulingErrorCode, string> = {
    SLOT_TAKEN: "That appointment time was just taken.",
    HOLD_EXPIRED: "Your five-minute slot hold has expired.",
    NETWORK_ERROR: "The scheduling service could not be reached.",
  };
  throw new SchedulingError(code, messages[code]);
}

function asNetworkError(error: unknown): never {
  const message =
    error instanceof Error ? error.message : "Unexpected scheduling error.";
  throw new SchedulingError("NETWORK_ERROR", message);
}

type SlotRpcPayload = {
  success?: boolean;
  code?: string;
  expires_at?: string;
};

function schedulingErrorFromSlotRpc(code: string | undefined): SchedulingError {
  if (code === "HOLD_EXPIRED") {
    return new SchedulingError(
      "HOLD_EXPIRED",
      "Your five-minute slot hold has expired.",
    );
  }
  if (code === "SLOT_TAKEN" || code === "SLOT_IN_USE") {
    return new SchedulingError(
      "SLOT_TAKEN",
      "That appointment time was just taken.",
    );
  }
  return new SchedulingError(
    "NETWORK_ERROR",
    "The scheduling service could not be reached.",
  );
}

function parseSlotRpcPayload(data: unknown): SlotRpcPayload {
  if (!data || typeof data !== "object") {
    return {};
  }
  return data as SlotRpcPayload;
}

async function invokeSlotRpc(
  fn:
    | "cleanup_expired_slot_holds"
    | "hold_slot_if_available"
    | "release_slot_hold"
    | "book_held_slot"
    | "free_orphan_booked_slot",
  args: Record<string, unknown> = {},
): Promise<SlotRpcPayload> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) {
    asNetworkError(error);
  }
  const payload = parseSlotRpcPayload(data);
  if (payload.success === false) {
    throw schedulingErrorFromSlotRpc(payload.code);
  }
  return payload;
}

async function getCurrentUserId(): Promise<string> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) {
    throw new SchedulingError(
      "NETWORK_ERROR",
      "You must be signed in to use scheduling.",
    );
  }
  return user.id;
}

async function getCurrentUserRole(): Promise<string | null> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    asNetworkError(error);
  }
  return (data?.role as string | undefined) ?? null;
}

async function assertCanManageDoctorSchedule(doctorId: string): Promise<void> {
  const userId = await getCurrentUserId();
  const role = await getCurrentUserRole();

  if (role === "admin") {
    return;
  }
  if (role === "doctor" && userId === doctorId) {
    return;
  }

  throw new SchedulingError(
    "NETWORK_ERROR",
    "You cannot manage this doctor's schedule.",
  );
}

function normalizeTimeForDb(timeHm: string): string {
  return timeHm.length === 5 ? `${timeHm}:00` : timeHm;
}

async function cleanupExpiredHolds(): Promise<void> {
  try {
    await invokeSlotRpc("cleanup_expired_slot_holds");
  } catch {
    // Best-effort; listing slots should still proceed.
  }
}

async function fetchBufferMinutes(): Promise<number> {
  const { data, error } = await supabase
    .from("hospital_settings")
    .select("buffer_minutes")
    .eq("id", 1)
    .maybeSingle();

  if (error || !data) {
    return 15;
  }
  return Math.max(0, data.buffer_minutes as number);
}

async function bookedEndsForDoctor(doctorId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("appointment_slots")
    .select("slot_date, end_time")
    .eq("doctor_id", doctorId)
    .eq("status", "booked");

  if (error || !data) {
    return [];
  }

  return (data as Pick<SlotRow, "slot_date" | "end_time">[]).map((row) => {
    const endTime =
      row.end_time.length === 5 ? `${row.end_time}:00` : row.end_time;
    return parseISO(`${row.slot_date}T${endTime}`).toISOString();
  });
}

/** Postgres / PostgREST often round-trip timestamptz without ms or with +00:00 vs Z. */
function holdExpiryMs(iso: string): number {
  const ms = new Date(iso).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function holdExpiryMatches(clientIso: string, serverIso: string): boolean {
  return Math.abs(holdExpiryMs(clientIso) - holdExpiryMs(serverIso)) <= 2000;
}

type AppointmentManager = "doctor" | "patient";

async function fetchAppointmentRow(
  appointmentId: string,
): Promise<AppointmentRow> {
  const { data, error } = await supabase
    .from("appointments")
    .select("*, appointment_slots(slot_date, start_time, end_time)")
    .eq("id", appointmentId)
    .maybeSingle();

  if (error) {
    asNetworkError(error);
  }
  if (!data) {
    throw new SchedulingError(
      "NETWORK_ERROR",
      "Appointment not found.",
    );
  }
  return data as AppointmentRow;
}

function appointmentManager(
  row: AppointmentRow,
  userId: string,
): AppointmentManager | null {
  if (row.doctor_id === userId) {
    return "doctor";
  }
  if (
    row.account_holder_id === userId ||
    row.patient_id === userId
  ) {
    return "patient";
  }
  return null;
}

function appointmentVisitDateYmd(row: AppointmentRow): string {
  const slot = row.appointment_slots;
  const slotRow = Array.isArray(slot) ? slot[0] : slot;
  if (slotRow?.slot_date) {
    return slotRow.slot_date as string;
  }
  return row.appointment_date;
}

function assertCanManageAppointment(
  row: AppointmentRow,
  userId: string,
): AppointmentManager {
  const manager = appointmentManager(row, userId);
  if (!manager) {
    throw new SchedulingError(
      "NETWORK_ERROR",
      "You cannot modify this appointment.",
    );
  }
  if (row.status === "cancelled" || row.status === "completed") {
    throw new SchedulingError(
      "NETWORK_ERROR",
      "This appointment can no longer be changed.",
    );
  }
  return manager;
}

function assertValidHold(
  slotId: string,
  hold: SlotHold,
  activeHold: SlotHold | null,
  heldByUserId?: string | null,
  currentUserId?: string,
): void {
  consumeFailure("HOLD_EXPIRED");

  if (
    !activeHold ||
    activeHold.slotId !== slotId ||
    hold.slotId !== slotId
  ) {
    throw new SchedulingError(
      "HOLD_EXPIRED",
      "Your five-minute slot hold has expired.",
    );
  }

  if (
    currentUserId &&
    heldByUserId &&
    heldByUserId !== currentUserId
  ) {
    throw new SchedulingError(
      "SLOT_TAKEN",
      "That appointment time was just taken.",
    );
  }

  const serverExpiresMs = holdExpiryMs(activeHold.expiresAt);
  if (serverExpiresMs <= Date.now()) {
    throw new SchedulingError(
      "HOLD_EXPIRED",
      "Your five-minute slot hold has expired.",
    );
  }

  if (!holdExpiryMatches(hold.expiresAt, activeHold.expiresAt)) {
    throw new SchedulingError(
      "HOLD_EXPIRED",
      "Your five-minute slot hold has expired.",
    );
  }
}

export const schedulingService: SchedulingService = {
  injectNextFailure(code) {
    nextFailure = code;
  },

  async listBeneficiaries(accountHolderId) {
    await wait();
    consumeFailure("NETWORK_ERROR");

    try {
      const { data, error } = await supabase
        .from("beneficiaries")
        .select("*")
        .eq("account_holder_id", accountHolderId)
        .order("relationship", { ascending: true });

      if (error) {
        asNetworkError(error);
      }

      return ((data ?? []) as BeneficiaryRow[]).map(mapBeneficiary);
    } catch (error) {
      if (error instanceof SchedulingError) {
        throw error;
      }
      asNetworkError(error);
    }
  },

  async ensureSelfBeneficiary(accountHolderId) {
    await wait();
    consumeFailure("NETWORK_ERROR");

    try {
      const existing = await schedulingService.listBeneficiaries(accountHolderId);
      const self = existing.find((row) => row.relationship === "self");
      if (self) {
        return self;
      }

      const userId = await getCurrentUserId();
      if (userId !== accountHolderId) {
        return null;
      }

      const [{ data: profile, error: profileError }, { data: authData }] =
        await Promise.all([
          supabase
            .from("profiles")
            .select("full_name")
            .eq("id", accountHolderId)
            .single(),
          supabase.auth.getUser(),
        ]);

      if (profileError) {
        asNetworkError(profileError);
      }

      const metadata = authData.user?.user_metadata ?? {};
      const dob =
        typeof metadata.dob === "string" && metadata.dob.trim()
          ? metadata.dob.trim()
          : undefined;
      const gender =
        typeof metadata.gender === "string" && metadata.gender.trim()
          ? metadata.gender.trim()
          : undefined;

      if (!dob || !gender) {
        return null;
      }

      const displayName =
        profile?.full_name?.trim() ||
        (typeof metadata.full_name === "string"
          ? metadata.full_name.trim()
          : "") ||
        "Patient";

      return await schedulingService.createBeneficiary({
        accountHolderId,
        displayName,
        relationship: "self",
        dob,
        gender,
      });
    } catch (error) {
      if (error instanceof SchedulingError) {
        throw error;
      }
      asNetworkError(error);
    }
  },

  async createBeneficiary(input) {
    await wait();
    consumeFailure("NETWORK_ERROR");

    try {
      const userId = await getCurrentUserId();
      if (userId !== input.accountHolderId) {
        throw new SchedulingError(
          "NETWORK_ERROR",
          "You can only add beneficiaries to your own account.",
        );
      }

      if (input.relationship === "self") {
        const { data: existingSelf, error: selfError } = await supabase
          .from("beneficiaries")
          .select("id")
          .eq("account_holder_id", input.accountHolderId)
          .eq("relationship", "self")
          .maybeSingle();

        if (selfError) {
          asNetworkError(selfError);
        }
        if (existingSelf) {
          throw new SchedulingError(
            "NETWORK_ERROR",
            "Your self patient profile already exists.",
          );
        }
      }

      const { data, error } = await supabase
        .from("beneficiaries")
        .insert({
          account_holder_id: input.accountHolderId,
          display_name: input.displayName,
          relationship: input.relationship,
          dob: input.dob,
          gender: input.gender,
          national_id: input.nationalId ?? null,
          hospital_file_id: input.hospitalFileId ?? null,
        })
        .select("*")
        .single();

      if (error || !data) {
        asNetworkError(error ?? new Error("Beneficiary could not be saved."));
      }

      return mapBeneficiary(data as BeneficiaryRow);
    } catch (error) {
      if (error instanceof SchedulingError) {
        throw error;
      }
      asNetworkError(error);
    }
  },

  async listDoctors() {
    await wait();
    consumeFailure("NETWORK_ERROR");

    try {
      const { data, error } = await supabase
        .from("doctors")
        .select(
          "id, specialty, department, is_accepting_bookings, is_active, profile:profiles(full_name)",
        )
        .eq("is_active", true);

      if (error) {
        asNetworkError(error);
      }

      const doctors = (data ?? []) as DoctorRow[];
      const { data: slotRows, error: slotError } = await supabase
        .from("appointment_slots")
        .select("doctor_id, slot_date, start_time, end_time, status")
        .eq("status", "available")
        .gte("slot_date", todayYmdLocal())
        .order("slot_date", { ascending: true })
        .order("start_time", { ascending: true });

      if (slotError) {
        asNetworkError(slotError);
      }

      const nextByDoctor = new Map<string, string>();
      ((slotRows ?? []) as SlotRow[]).forEach((row) => {
        if (!nextByDoctor.has(row.doctor_id)) {
          nextByDoctor.set(row.doctor_id, slotStartsAt(row));
        }
      });

      const fallback = addMinutes(new Date(), 24 * 60).toISOString();
      return doctors.map((row) =>
        mapDoctor(row, nextByDoctor.get(row.id) ?? fallback),
      );
    } catch (error) {
      if (error instanceof SchedulingError) {
        throw error;
      }
      asNetworkError(error);
    }
  },

  async listDoctorsForAdmin() {
    await wait();
    consumeFailure("NETWORK_ERROR");

    try {
      const role = await getCurrentUserRole();
      if (role !== "admin") {
        throw new SchedulingError(
          "NETWORK_ERROR",
          "Only administrators can view the full roster.",
        );
      }

      const { data, error } = await supabase
        .from("doctors")
        .select(
          "id, specialty, department, is_accepting_bookings, is_active, profile:profiles(full_name, is_active)",
        );

      if (error) {
        asNetworkError(error);
      }

      const doctors = (data ?? []) as DoctorRow[];
      const { data: slotRows, error: slotError } = await supabase
        .from("appointment_slots")
        .select("doctor_id, slot_date, start_time, end_time, status")
        .eq("status", "available")
        .gte("slot_date", todayYmdLocal())
        .order("slot_date", { ascending: true })
        .order("start_time", { ascending: true });

      if (slotError) {
        asNetworkError(slotError);
      }

      const nextByDoctor = new Map<string, string>();
      ((slotRows ?? []) as SlotRow[]).forEach((row) => {
        if (!nextByDoctor.has(row.doctor_id)) {
          nextByDoctor.set(row.doctor_id, slotStartsAt(row));
        }
      });

      const fallback = addMinutes(new Date(), 24 * 60).toISOString();
      return doctors.map((row) =>
        mapRosterDoctor(row, nextByDoctor.get(row.id) ?? fallback),
      );
    } catch (error) {
      if (error instanceof SchedulingError) {
        throw error;
      }
      asNetworkError(error);
    }
  },

  async listSlots(doctorId) {
    await wait();
    consumeFailure("NETWORK_ERROR");

    try {
      await cleanupExpiredHolds();

      const { data, error } = await supabase
        .from("appointment_slots")
        .select("*")
        .eq("doctor_id", doctorId)
        .gte("slot_date", todayYmdLocal())
        .order("slot_date", { ascending: true })
        .order("start_time", { ascending: true });

      if (error) {
        asNetworkError(error);
      }

      const bufferMinutes = await fetchBufferMinutes();
      const bookedEnds = await bookedEndsForDoctor(doctorId);
      const nowMs = Date.now();
      const slots = ((data ?? []) as SlotRow[])
        .map(mapSlot)
        .filter((slot) => parseISO(slot.startsAt).getTime() >= nowMs);
      return applyBufferToSlots(slots, bookedEnds, bufferMinutes);
    } catch (error) {
      if (error instanceof SchedulingError) {
        throw error;
      }
      asNetworkError(error);
    }
  },

  async holdSlot(slotId) {
    await wait();
    consumeFailure("NETWORK_ERROR");
    consumeFailure("SLOT_TAKEN");

    try {
      await getCurrentUserId();
      const payload = await invokeSlotRpc("hold_slot_if_available", {
        p_slot_id: slotId,
        p_ttl_seconds: holdDurationSeconds,
      });
      const expiresAt = payload.expires_at;
      if (!expiresAt) {
        throw new SchedulingError(
          "NETWORK_ERROR",
          "The scheduling service could not be reached.",
        );
      }
      return { slotId, expiresAt };
    } catch (error) {
      if (error instanceof SchedulingError) {
        throw error;
      }
      asNetworkError(error);
    }
  },

  async releaseHold(slotId) {
    await wait();
    consumeFailure("NETWORK_ERROR");

    try {
      await getCurrentUserId();
      try {
        await invokeSlotRpc("release_slot_hold", { p_slot_id: slotId });
      } catch {
        // Best-effort (sign-out / abandon flows).
      }
    } catch (error) {
      if (error instanceof SchedulingError) {
        throw error;
      }
      asNetworkError(error);
    }
  },

  async syncBookingHold(slotId, hold) {
    await wait();
    consumeFailure("NETWORK_ERROR");

    try {
      const userId = await getCurrentUserId();
      await cleanupExpiredHolds();

      const { data: holdRow, error: holdError } = await supabase
        .from("slot_holds")
        .select("slot_id, expires_at, held_by")
        .eq("slot_id", slotId)
        .maybeSingle();

      if (holdError) {
        asNetworkError(holdError);
      }

      const activeHold: SlotHold | null = holdRow
        ? {
            slotId: holdRow.slot_id as string,
            expiresAt: holdRow.expires_at as string,
          }
        : null;

      assertValidHold(
        slotId,
        hold,
        activeHold,
        holdRow?.held_by as string | undefined,
        userId,
      );

      return {
        slotId,
        expiresAt: activeHold!.expiresAt,
      };
    } catch (error) {
      if (error instanceof SchedulingError) {
        throw error;
      }
      asNetworkError(error);
    }
  },

  async confirmBooking(input) {
    await wait();
    consumeFailure("NETWORK_ERROR");

    try {
      const userId = await getCurrentUserId();
      if (userId !== input.accountHolderId) {
        throw new SchedulingError(
          "NETWORK_ERROR",
          "You can only confirm bookings for your own account.",
        );
      }

      const { data: holdRow, error: holdError } = await supabase
        .from("slot_holds")
        .select("slot_id, expires_at, held_by")
        .eq("slot_id", input.slotId)
        .maybeSingle();

      if (holdError) {
        asNetworkError(holdError);
      }

      const activeHold: SlotHold | null = holdRow
        ? {
            slotId: holdRow.slot_id as string,
            expiresAt: holdRow.expires_at as string,
          }
        : null;
      assertValidHold(
        input.slotId,
        input.hold,
        activeHold,
        holdRow?.held_by as string | undefined,
        userId,
      );

      const { data: slot, error: slotError } = await supabase
        .from("appointment_slots")
        .select("*")
        .eq("id", input.slotId)
        .maybeSingle();

      if (slotError || !slot) {
        throw new SchedulingError(
          "SLOT_TAKEN",
          "That appointment time is no longer available.",
        );
      }

      if (parseISO(slotStartsAt(slot as SlotRow)).getTime() < Date.now()) {
        throw new SchedulingError(
          "SLOT_TAKEN",
          "That appointment time is in the past.",
        );
      }

      const slotRow = slot as SlotRow;
      if (slotRow.doctor_id !== input.doctorId || slotRow.status !== "held") {
        throw new SchedulingError(
          "SLOT_TAKEN",
          "That appointment time is no longer available.",
        );
      }

      const startTime =
        slotRow.start_time.length === 5
          ? `${slotRow.start_time}:00`
          : slotRow.start_time;

      const { data: appointmentRow, error: insertError } = await supabase
        .from("appointments")
        .insert({
          patient_id: input.accountHolderId,
          account_holder_id: input.accountHolderId,
          beneficiary_id: input.beneficiaryId,
          doctor_id: input.doctorId,
          slot_id: input.slotId,
          appointment_date: slotRow.slot_date,
          start_time: startTime,
          status: "pending",
          appointment_type: input.type,
          reason: input.reason?.trim() || null,
          notes: input.notes?.trim() || null,
          room: input.room ?? null,
          video_url: input.videoUrl ?? null,
          address: input.address?.trim() || null,
        })
        .select("*")
        .single();

      if (insertError || !appointmentRow) {
        throw new SchedulingError(
          "SLOT_TAKEN",
          "That appointment time was just taken.",
        );
      }

      await invokeSlotRpc("book_held_slot", { p_slot_id: input.slotId });

      return mapAppointment(appointmentRow as AppointmentRow);
    } catch (error) {
      if (error instanceof SchedulingError) {
        throw error;
      }
      asNetworkError(error);
    }
  },

  async listAppointments(accountHolderId) {
    await wait();
    consumeFailure("NETWORK_ERROR");

    try {
      const { data, error } = await supabase
        .from("appointments")
        .select("*, appointment_slots(slot_date, start_time, end_time)")
        .or(
          `account_holder_id.eq.${accountHolderId},patient_id.eq.${accountHolderId}`,
        )
        .order("appointment_date", { ascending: true })
        .order("start_time", { ascending: true });

      if (error) {
        asNetworkError(error);
      }

      return ((data ?? []) as AppointmentRow[]).map(mapAppointment);
    } catch (error) {
      if (error instanceof SchedulingError) {
        throw error;
      }
      asNetworkError(error);
    }
  },

  async listDoctorAppointments(doctorId) {
    await wait();
    consumeFailure("NETWORK_ERROR");

    try {
      const { data, error } = await supabase
        .from("appointments")
        .select("*, appointment_slots(slot_date, start_time, end_time)")
        .eq("doctor_id", doctorId)
        .order("appointment_date", { ascending: true })
        .order("start_time", { ascending: true });

      if (error) {
        asNetworkError(error);
      }

      return ((data ?? []) as AppointmentRow[]).map(mapAppointment);
    } catch (error) {
      if (error instanceof SchedulingError) {
        throw error;
      }
      asNetworkError(error);
    }
  },

  async enrichDoctorAgendaVisits(appointments) {
    await wait();
    consumeFailure("NETWORK_ERROR");

    const context = new Map<string, DoctorAgendaVisitContext>();

    if (appointments.length === 0) {
      return context;
    }

    const holderIds = [
      ...new Set(appointments.map((row) => row.accountHolderId)),
    ];
    const beneficiaryIds = [
      ...new Set(appointments.map((row) => row.beneficiaryId)),
    ];

    try {
      const [{ data: profiles, error: profileError }, { data: beneficiaries, error: benError }] =
        await Promise.all([
          supabase.from("profiles").select("id, full_name").in("id", holderIds),
          supabase
            .from("beneficiaries")
            .select("id, display_name, relationship")
            .in("id", beneficiaryIds),
        ]);

      if (profileError) {
        asNetworkError(profileError);
      }
      if (benError) {
        asNetworkError(benError);
      }

      const holderNameById = new Map(
        (profiles ?? []).map((row) => [row.id as string, row.full_name as string]),
      );
      const beneficiaryById = new Map(
        (beneficiaries ?? []).map((row) => [
          row.id as string,
          {
            displayName: row.display_name as string,
            relationship: row.relationship as Beneficiary["relationship"],
          },
        ]),
      );

      for (const appointment of appointments) {
        const beneficiary = beneficiaryById.get(appointment.beneficiaryId);
        const accountHolderName =
          holderNameById.get(appointment.accountHolderId) ?? "Account holder";
        const relationship = beneficiary?.relationship ?? "self";
        const beneficiaryName = beneficiary?.displayName ?? accountHolderName;

        context.set(appointment.id, {
          beneficiaryName,
          accountHolderName,
          relationship,
          proxyTag: doctorProxyTag(accountHolderName, relationship),
        });
      }

      return context;
    } catch (error) {
      if (error instanceof SchedulingError) {
        throw error;
      }
      asNetworkError(error);
    }
  },

  async confirmDoctorAppointment(appointmentId, input) {
    await wait();
    consumeFailure("NETWORK_ERROR");

    try {
      const userId = await getCurrentUserId();
      const appointment = await fetchAppointmentRow(appointmentId);

      if (appointment.doctor_id !== userId) {
        throw new SchedulingError(
          "NETWORK_ERROR",
          "You can only confirm visits on your schedule.",
        );
      }
      if (appointment.status === "cancelled" || appointment.status === "completed") {
        throw new SchedulingError(
          "NETWORK_ERROR",
          "This appointment can no longer be confirmed.",
        );
      }
      if (appointment.status === "confirmed") {
        return mapAppointment(appointment);
      }

      const visitType = appointment.appointment_type as AppointmentType;
      const room = input?.room?.trim();
      const videoUrl = input?.videoUrl?.trim();

      if (visitType === "in-clinic" && !room) {
        throw new SchedulingError(
          "NETWORK_ERROR",
          "Enter a room before confirming an in-clinic visit.",
        );
      }
      if (visitType === "telehealth" && !videoUrl) {
        throw new SchedulingError(
          "NETWORK_ERROR",
          "Enter a video link before confirming telehealth.",
        );
      }

      const { data: updated, error } = await supabase
        .from("appointments")
        .update({
          status: "confirmed",
          room: visitType === "in-clinic" ? room : appointment.room,
          video_url: visitType === "telehealth" ? videoUrl : appointment.video_url,
        })
        .eq("id", appointmentId)
        .select("*, appointment_slots(slot_date, start_time, end_time)")
        .single();

      if (error || !updated) {
        asNetworkError(error ?? new Error("Confirm failed."));
      }

      return mapAppointment(updated as AppointmentRow);
    } catch (error) {
      if (error instanceof SchedulingError) {
        throw error;
      }
      asNetworkError(error);
    }
  },

  async completeDoctorAppointment(appointmentId) {
    await wait();
    consumeFailure("NETWORK_ERROR");

    try {
      const userId = await getCurrentUserId();
      const appointment = await fetchAppointmentRow(appointmentId);

      if (appointment.doctor_id !== userId) {
        throw new SchedulingError(
          "NETWORK_ERROR",
          "You can only complete visits on your schedule.",
        );
      }
      if (appointment.status !== "confirmed") {
        throw new SchedulingError(
          "NETWORK_ERROR",
          "Only confirmed visits can be marked complete.",
        );
      }

      const visitDateYmd = appointmentVisitDateYmd(appointment);
      if (visitDateYmd > todayYmdLocal()) {
        throw new SchedulingError(
          "NETWORK_ERROR",
          "This visit is not ready to complete yet.",
        );
      }

      const { data: updated, error } = await supabase
        .from("appointments")
        .update({ status: "completed" })
        .eq("id", appointmentId)
        .select("*, appointment_slots(slot_date, start_time, end_time)")
        .single();

      if (error || !updated) {
        asNetworkError(error ?? new Error("Complete visit failed."));
      }

      return mapAppointment(updated as AppointmentRow);
    } catch (error) {
      if (error instanceof SchedulingError) {
        throw error;
      }
      asNetworkError(error);
    }
  },

  async rescheduleAppointment(appointmentId, newSlotId, hold) {
    await wait();
    consumeFailure("NETWORK_ERROR");

    try {
      const userId = await getCurrentUserId();
      const appointment = await fetchAppointmentRow(appointmentId);
      const manager = assertCanManageAppointment(appointment, userId);

      const { data: holdRow } = await supabase
        .from("slot_holds")
        .select("slot_id, expires_at, held_by")
        .eq("slot_id", newSlotId)
        .maybeSingle();

      assertValidHold(
        newSlotId,
        hold,
        holdRow
          ? {
              slotId: holdRow.slot_id as string,
              expiresAt: holdRow.expires_at as string,
            }
          : null,
        holdRow?.held_by as string | undefined,
        userId,
      );

      const { data: newSlot, error: slotError } = await supabase
        .from("appointment_slots")
        .select("*")
        .eq("id", newSlotId)
        .maybeSingle();

      if (slotError || !newSlot || (newSlot as SlotRow).status !== "held") {
        throw new SchedulingError(
          "SLOT_TAKEN",
          "The replacement appointment time is unavailable.",
        );
      }

      const slotRow = newSlot as SlotRow;
      if (parseISO(slotStartsAt(slotRow)).getTime() < Date.now()) {
        throw new SchedulingError(
          "SLOT_TAKEN",
          "That appointment time is in the past.",
        );
      }
      if (
        manager === "doctor" &&
        slotRow.doctor_id !== appointment.doctor_id
      ) {
        throw new SchedulingError(
          "NETWORK_ERROR",
          "Choose a slot on your own schedule.",
        );
      }
      if (
        manager === "patient" &&
        slotRow.doctor_id !== appointment.doctor_id
      ) {
        throw new SchedulingError(
          "NETWORK_ERROR",
          "Reschedule must stay with the same doctor.",
        );
      }

      const previousSlotId = appointment.slot_id;
      const startTime =
        slotRow.start_time.length === 5
          ? `${slotRow.start_time}:00`
          : slotRow.start_time;

      const nextStatus =
        manager === "patient" && appointment.status === "pending"
          ? "pending"
          : "confirmed";

      const { data: updated, error: updateError } = await supabase
        .from("appointments")
        .update({
          slot_id: newSlotId,
          doctor_id: slotRow.doctor_id,
          appointment_date: slotRow.slot_date,
          start_time: startTime,
          status: nextStatus,
        })
        .eq("id", appointmentId)
        .select("*")
        .single();

      if (updateError || !updated) {
        asNetworkError(updateError ?? new Error("Reschedule failed."));
      }

      if (previousSlotId) {
        await invokeSlotRpc("free_orphan_booked_slot", {
          p_slot_id: previousSlotId,
        });
      }
      await invokeSlotRpc("book_held_slot", { p_slot_id: newSlotId });

      return mapAppointment(updated as AppointmentRow);
    } catch (error) {
      if (error instanceof SchedulingError) {
        throw error;
      }
      asNetworkError(error);
    }
  },

  async cancelAppointment(appointmentId) {
    await wait();
    consumeFailure("NETWORK_ERROR");

    try {
      const userId = await getCurrentUserId();
      await assertCanManageAppointment(
        await fetchAppointmentRow(appointmentId),
        userId,
      );

      const { data: updated, error } = await supabase
        .from("appointments")
        .update({ status: "cancelled" })
        .eq("id", appointmentId)
        .select("*, appointment_slots(slot_date, start_time, end_time)")
        .single();

      if (error || !updated) {
        asNetworkError(error ?? new Error("Cancel failed."));
      }

      const row = updated as AppointmentRow;
      if (row.slot_id) {
        try {
          await invokeSlotRpc("free_orphan_booked_slot", {
            p_slot_id: row.slot_id,
          });
        } catch {
          // Appointment is cancelled; slot cleanup is best-effort.
        }
      }

      return mapAppointment({ ...row, status: "cancelled" });
    } catch (error) {
      if (error instanceof SchedulingError) {
        throw error;
      }
      asNetworkError(error);
    }
  },

  async listAllAppointments() {
    await wait();
    consumeFailure("NETWORK_ERROR");

    try {
      const { data, error } = await supabase
        .from("appointments")
        .select("*, appointment_slots(slot_date, start_time, end_time)")
        .order("appointment_date", { ascending: true })
        .order("start_time", { ascending: true });

      if (error) {
        asNetworkError(error);
      }

      return ((data ?? []) as AppointmentRow[]).map(mapAppointment);
    } catch (error) {
      if (error instanceof SchedulingError) {
        throw error;
      }
      asNetworkError(error);
    }
  },

  async listSlotsOnDate(doctorId, dateYmd) {
    await wait();
    consumeFailure("NETWORK_ERROR");

    try {
      await cleanupExpiredHolds();

      const { data, error } = await supabase
        .from("appointment_slots")
        .select("*")
        .eq("doctor_id", doctorId)
        .eq("slot_date", dateYmd)
        .order("start_time", { ascending: true });

      if (error) {
        asNetworkError(error);
      }

      const bufferMinutes = await fetchBufferMinutes();
      const bookedEnds = await bookedEndsForDoctor(doctorId);
      const slots = ((data ?? []) as SlotRow[]).map(mapSlot);
      return applyBufferToSlots(slots, bookedEnds, bufferMinutes);
    } catch (error) {
      if (error instanceof SchedulingError) {
        throw error;
      }
      asNetworkError(error);
    }
  },

  async listScheduleSlotsOnDate(doctorId, dateYmd) {
    await wait();
    consumeFailure("NETWORK_ERROR");

    try {
      await assertCanManageDoctorSchedule(doctorId);
      await cleanupExpiredHolds();

      const { data, error } = await supabase
        .from("appointment_slots")
        .select("*")
        .eq("doctor_id", doctorId)
        .eq("slot_date", dateYmd)
        .order("start_time", { ascending: true });

      if (error) {
        asNetworkError(error);
      }

      return ((data ?? []) as SlotRow[]).map(mapSlot);
    } catch (error) {
      if (error instanceof SchedulingError) {
        throw error;
      }
      asNetworkError(error);
    }
  },

  async createAvailabilitySlot(input) {
    await wait();
    consumeFailure("NETWORK_ERROR");

    try {
      await assertCanManageDoctorSchedule(input.doctorId);

      const startTime = normalizeTimeForDb(input.startTime);
      const endTime = normalizeTimeForDb(input.endTime);

      try {
        assertScheduleDateNotInPast(input.slotDate);
        assertScheduleInstantNotInPast(parseISO(`${input.slotDate}T${startTime}`));
      } catch (cause) {
        throw new SchedulingError(
          "NETWORK_ERROR",
          cause instanceof Error
            ? cause.message
            : "Cannot schedule in the past.",
        );
      }

      const { data, error } = await supabase
        .from("appointment_slots")
        .insert({
          doctor_id: input.doctorId,
          slot_date: input.slotDate,
          start_time: startTime,
          end_time: endTime,
          status: "available",
        })
        .select("*")
        .single();

      if (error) {
        if (error.code === "23505") {
          throw new SchedulingError(
            "SLOT_TAKEN",
            "An open slot already exists at that start time.",
          );
        }
        asNetworkError(error);
      }
      if (!data) {
        asNetworkError(new Error("Slot could not be created."));
      }

      return mapSlot(data as SlotRow);
    } catch (error) {
      if (error instanceof SchedulingError) {
        throw error;
      }
      asNetworkError(error);
    }
  },

  async removeAvailabilitySlot(slotId) {
    await wait();
    consumeFailure("NETWORK_ERROR");

    try {
      const { data: slot, error: readError } = await supabase
        .from("appointment_slots")
        .select("*")
        .eq("id", slotId)
        .maybeSingle();

      if (readError) {
        asNetworkError(readError);
      }
      if (!slot) {
        throw new SchedulingError("NETWORK_ERROR", "Slot not found.");
      }

      const slotRow = slot as SlotRow;
      await assertCanManageDoctorSchedule(slotRow.doctor_id);

      if (slotRow.status === "booked" || slotRow.status === "held") {
        throw new SchedulingError(
          "NETWORK_ERROR",
          "Booked or held slots cannot be removed. Cancel the appointment first.",
        );
      }

      const { error: deleteError } = await supabase
        .from("appointment_slots")
        .delete()
        .eq("id", slotId);

      if (deleteError) {
        asNetworkError(deleteError);
      }
    } catch (error) {
      if (error instanceof SchedulingError) {
        throw error;
      }
      asNetworkError(error);
    }
  },

  async setDoctorAcceptingBookings(doctorId, isAcceptingBookings) {
    await wait();
    consumeFailure("NETWORK_ERROR");

    try {
      await assertCanManageDoctorSchedule(doctorId);

      const { data, error } = await supabase
        .from("doctors")
        .update({ is_accepting_bookings: isAcceptingBookings })
        .eq("id", doctorId)
        .select(
          "id, specialty, department, is_accepting_bookings, is_active, profile:profiles(full_name)",
        )
        .single();

      if (error || !data) {
        asNetworkError(error ?? new Error("Could not update booking status."));
      }

      const fallback = addMinutes(new Date(), 24 * 60).toISOString();
      return mapDoctor(data as DoctorRow, fallback);
    } catch (error) {
      if (error instanceof SchedulingError) {
        throw error;
      }
      asNetworkError(error);
    }
  },

  async setBlackout(input) {
    await wait();
    consumeFailure("NETWORK_ERROR");

    try {
      try {
        assertScheduleInstantNotInPast(input.startsAt);
      } catch (cause) {
        throw new SchedulingError(
          "NETWORK_ERROR",
          cause instanceof Error
            ? cause.message
            : "Cannot schedule in the past.",
        );
      }

      const { data: blackoutRow, error } = await supabase
        .from("blackout_rules")
        .insert({
          doctor_id: input.doctorId,
          starts_at: input.startsAt,
          ends_at: input.endsAt,
          reason: input.reason,
          set_by: input.setBy,
        })
        .select("*")
        .single();

      if (error || !blackoutRow) {
        asNetworkError(error ?? new Error("Blackout could not be saved."));
      }

      const startsAt = parseISO(input.startsAt).getTime();
      const endsAt = parseISO(input.endsAt).getTime();

      const { data: slots, error: slotError } = await supabase
        .from("appointment_slots")
        .select("*")
        .eq("doctor_id", input.doctorId);

      if (slotError) {
        asNetworkError(slotError);
      }

      const overlapping = ((slots ?? []) as SlotRow[]).filter((slot) => {
        const slotStart = parseISO(slotStartsAt(slot)).getTime();
        const slotEnd = slotStart + slotDurationMin(slot) * 60_000;
        return slotStart < endsAt && slotEnd > startsAt;
      });

      if (overlapping.length > 0) {
        await supabase
          .from("appointment_slots")
          .update({ status: "blackout" })
          .in(
            "id",
            overlapping.map((slot) => slot.id),
          );
      }

      return mapBlackout(blackoutRow as BlackoutRow);
    } catch (error) {
      if (error instanceof SchedulingError) {
        throw error;
      }
      asNetworkError(error);
    }
  },

  async listBlackouts(doctorId) {
    await wait();
    consumeFailure("NETWORK_ERROR");

    try {
      const { data, error } = await supabase
        .from("blackout_rules")
        .select("*")
        .eq("doctor_id", doctorId)
        .order("starts_at", { ascending: true });

      if (error) {
        asNetworkError(error);
      }

      return ((data ?? []) as BlackoutRow[]).map(mapBlackout);
    } catch (error) {
      if (error instanceof SchedulingError) {
        throw error;
      }
      asNetworkError(error);
    }
  },

  async deleteBlackout(blackoutId) {
    await wait();
    consumeFailure("NETWORK_ERROR");

    try {
      const { data: blackoutRow, error: fetchError } = await supabase
        .from("blackout_rules")
        .select("*")
        .eq("id", blackoutId)
        .maybeSingle();

      if (fetchError) {
        asNetworkError(fetchError);
      }
      if (!blackoutRow) {
        throw new SchedulingError("NETWORK_ERROR", "Blackout not found.");
      }

      const rule = mapBlackout(blackoutRow as BlackoutRow);
      await assertCanManageDoctorSchedule(rule.doctorId);

      if (parseISO(rule.endsAt).getTime() <= Date.now()) {
        throw new SchedulingError(
          "NETWORK_ERROR",
          "Past blackouts cannot be removed.",
        );
      }

      const { error: deleteError } = await supabase
        .from("blackout_rules")
        .delete()
        .eq("id", blackoutId);

      if (deleteError) {
        asNetworkError(deleteError);
      }

      const removedStart = parseISO(rule.startsAt).getTime();
      const removedEnd = parseISO(rule.endsAt).getTime();

      const [{ data: remainingRows, error: remainingError }, { data: slots, error: slotError }] =
        await Promise.all([
          supabase
            .from("blackout_rules")
            .select("*")
            .eq("doctor_id", rule.doctorId),
          supabase
            .from("appointment_slots")
            .select("*")
            .eq("doctor_id", rule.doctorId),
        ]);

      if (remainingError || slotError) {
        asNetworkError(remainingError ?? slotError);
      }

      const remaining = ((remainingRows ?? []) as BlackoutRow[]).map(mapBlackout);

      const overlapsWindow = (
        slotStartMs: number,
        slotEndMs: number,
        startMs: number,
        endMs: number,
      ) => slotStartMs < endMs && slotEndMs > startMs;

      const stillBlackedOut = (slotStartMs: number, slotEndMs: number) =>
        remaining.some((other) =>
          overlapsWindow(
            slotStartMs,
            slotEndMs,
            parseISO(other.startsAt).getTime(),
            parseISO(other.endsAt).getTime(),
          ),
        );

      const toRelease = ((slots ?? []) as SlotRow[]).filter((slot) => {
        if (slot.status !== "blackout") {
          return false;
        }
        const slotStart = parseISO(slotStartsAt(slot)).getTime();
        const slotEnd = slotStart + slotDurationMin(slot) * 60_000;
        if (!overlapsWindow(slotStart, slotEnd, removedStart, removedEnd)) {
          return false;
        }
        return !stillBlackedOut(slotStart, slotEnd);
      });

      if (toRelease.length > 0) {
        await supabase
          .from("appointment_slots")
          .update({ status: "available" })
          .in(
            "id",
            toRelease.map((slot) => slot.id),
          );
      }
    } catch (error) {
      if (error instanceof SchedulingError) {
        throw error;
      }
      asNetworkError(error);
    }
  },

  async getSettings() {
    await wait();
    consumeFailure("NETWORK_ERROR");

    try {
      return { bufferMinutes: await fetchBufferMinutes() };
    } catch (error) {
      if (error instanceof SchedulingError) {
        throw error;
      }
      asNetworkError(error);
    }
  },

  async updateBufferMinutes(minutes) {
    await wait();
    consumeFailure("NETWORK_ERROR");

    try {
      const bufferMinutes = Math.max(0, Math.round(minutes));
      const { data, error } = await supabase
        .from("hospital_settings")
        .update({ buffer_minutes: bufferMinutes, updated_at: new Date().toISOString() })
        .eq("id", 1)
        .select("buffer_minutes")
        .single();

      if (error || !data) {
        asNetworkError(error ?? new Error("Settings update failed."));
      }

      return { bufferMinutes: data.buffer_minutes as number };
    } catch (error) {
      if (error instanceof SchedulingError) {
        throw error;
      }
      asNetworkError(error);
    }
  },
};

export function isAppointmentUpcoming(status: string): boolean {
  return status === "pending" || status === "confirmed" || status === "upcoming";
}

export function appointmentEndsAt(row: AppointmentRow, slot?: SlotRow): string {
  if (slot) {
    const endTime =
      slot.end_time.length === 5 ? `${slot.end_time}:00` : slot.end_time;
    return parseISO(`${slot.slot_date}T${endTime}`).toISOString();
  }
  const duration = 30;
  const start =
    row.start_time.length === 5 ? `${row.start_time}:00` : row.start_time;
  return addMinutes(
    parseISO(`${row.appointment_date}T${start}`),
    duration,
  ).toISOString();
}

export function isBeforeNow(iso: string): boolean {
  return isBefore(parseISO(iso), new Date());
}

export { toDbAppointmentStatus };
