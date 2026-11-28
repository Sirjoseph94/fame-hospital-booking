import type { ClinicSession, Doctor } from "@/types/scheduling";

export interface SessionCapacity {
  sessionId: string;
  startsAt: string;
  endsAt: string;
  booked: number;
  capacity: number;
  bookedPercent: number;
  cancelled: boolean;
}

export interface DoctorCapacityRow {
  doctorId: string;
  doctorName: string;
  /** Today's sessions in start order (cancelled ones included, flagged). */
  sessions: SessionCapacity[];
  /** Totals over scheduled (not cancelled) sessions. */
  booked: number;
  capacity: number;
  bookedPercent: number;
}

function percent(part: number, total: number): number {
  if (total === 0) {
    return 0;
  }
  return Math.min(100, Math.round((part / total) * 100));
}

/**
 * One row per doctor with sessions on the day, busiest first by name order;
 * doctors with no sessions follow so admins can see who isn't running clinic.
 */
export function buildCapacityRows(
  doctors: Doctor[],
  sessions: ClinicSession[],
): DoctorCapacityRow[] {
  const nameById = new Map(doctors.map((doctor) => [doctor.id, doctor.name]));
  const byDoctor = new Map<string, ClinicSession[]>();
  for (const session of sessions) {
    const list = byDoctor.get(session.doctorId) ?? [];
    list.push(session);
    byDoctor.set(session.doctorId, list);
  }

  const rows: DoctorCapacityRow[] = [];
  const doctorIds = new Set([...doctors.map((doctor) => doctor.id), ...byDoctor.keys()]);

  for (const doctorId of doctorIds) {
    const doctorSessions = (byDoctor.get(doctorId) ?? [])
      .slice()
      .sort((left, right) => left.startsAt.localeCompare(right.startsAt));
    const scheduled = doctorSessions.filter((session) => session.status === "scheduled");
    const booked = scheduled.reduce((sum, session) => sum + session.bookedCount, 0);
    const capacity = scheduled.reduce((sum, session) => sum + session.capacity, 0);

    rows.push({
      doctorId,
      doctorName: nameById.get(doctorId) ?? "Doctor",
      sessions: doctorSessions.map((session) => ({
        sessionId: session.id,
        startsAt: session.startsAt,
        endsAt: session.endsAt,
        booked: session.bookedCount,
        capacity: session.capacity,
        bookedPercent: percent(session.bookedCount, session.capacity),
        cancelled: session.status === "cancelled",
      })),
      booked,
      capacity,
      bookedPercent: percent(booked, capacity),
    });
  }

  return rows.sort((left, right) => {
    const leftHas = left.sessions.length > 0 ? 0 : 1;
    const rightHas = right.sessions.length > 0 ? 0 : 1;
    return leftHas - rightHas || left.doctorName.localeCompare(right.doctorName);
  });
}
