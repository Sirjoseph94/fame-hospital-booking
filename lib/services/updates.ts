import { supabase } from "@/lib/supabase";

import { localIso } from "@/lib/services/scheduling/mappers";

export type UpdateChannel = "email" | "sms" | "push";

/** One event sent to the user (grouped across email / SMS / push). */
export interface PatientUpdate {
  key: string;
  eventType: string;
  createdAt: string;
  appointmentId: string | null;
  doctorId?: string;
  /** Session window of the visit, when the booking still exists. */
  startsAt?: string;
  endsAt?: string;
  /** Channels that actually delivered it. */
  sentVia: UpdateChannel[];
}

interface DeliveryRow {
  id: string;
  appointment_id: string | null;
  event_type: string;
  channel: UpdateChannel;
  status: string;
  created_at: string;
  appointment:
    | {
        doctor_id: string;
        appointment_date: string;
        start_time: string;
        session:
          | { session_date: string; start_time: string; end_time: string }
          | { session_date: string; start_time: string; end_time: string }[]
          | null;
      }
    | null;
}

export class UpdatesError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UpdatesError";
  }
}

/** Groups per-channel delivery rows into one update per event. */
export function groupDeliveries(rows: DeliveryRow[]): PatientUpdate[] {
  const byKey = new Map<string, PatientUpdate>();
  for (const row of rows) {
    // Rows for one event are inserted together, so the second is enough to
    // separate a repeat of the same event later on.
    const key = `${row.appointment_id ?? "none"}:${row.event_type}:${row.created_at.slice(0, 19)}`;
    let update = byKey.get(key);
    if (!update) {
      const appointment = row.appointment;
      const session = Array.isArray(appointment?.session)
        ? appointment?.session[0]
        : appointment?.session;
      update = {
        key,
        eventType: row.event_type,
        createdAt: row.created_at,
        appointmentId: row.appointment_id,
        doctorId: appointment?.doctor_id,
        startsAt: session
          ? localIso(session.session_date, session.start_time)
          : appointment
            ? localIso(appointment.appointment_date, appointment.start_time)
            : undefined,
        endsAt: session ? localIso(session.session_date, session.end_time) : undefined,
        sentVia: [],
      };
      byKey.set(key, update);
    }
    if (row.status === "sent" && !update.sentVia.includes(row.channel)) {
      update.sentVia.push(row.channel);
    }
  }
  return [...byKey.values()].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

/** Patient-facing title for an event type. */
export function updateTitle(eventType: string): string {
  switch (eventType) {
    case "visit_booked":
      return "Visit booked";
    case "booking_pending_patient":
      return "Booking received";
    case "visit_confirmed":
      return "Visit confirmed";
    case "visit_cancelled":
      return "Visit cancelled";
    case "visit_rescheduled":
      return "Visit moved";
    case "visit_completed":
      return "Visit completed";
    default:
      return "Update";
  }
}

export const updatesService = {
  /** The signed-in user's own notifications (RLS: recipient only). */
  async listMyUpdates(userId: string, limit = 60): Promise<PatientUpdate[]> {
    const { data, error } = await supabase
      .from("notification_deliveries")
      .select(
        "id, appointment_id, event_type, channel, status, created_at, appointment:appointments(doctor_id, appointment_date, start_time, session:clinic_sessions(session_date, start_time, end_time))",
      )
      .eq("recipient_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      throw new UpdatesError(error.message || "Could not load your updates.");
    }
    return groupDeliveries((data ?? []) as unknown as DeliveryRow[]);
  },
};
