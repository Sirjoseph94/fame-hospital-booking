import { supabase } from "@/lib/supabase";

export interface ReportCounts {
  booked: number;
  seen: number;
  noShow: number;
  cancelled: number;
}

export interface VisitReport {
  fromYmd: string;
  toYmd: string;
  totals: ReportCounts & {
    upcoming: number;
    avgWaitMinutes: number | null;
    avgVisitMinutes: number | null;
  };
  doctors: (ReportCounts & { doctorId: string; name: string; avgWaitMinutes: number | null })[];
  days: { dateYmd: string; booked: number; seen: number; noShow: number }[];
}

export class ReportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReportError";
  }
}

/**
 * No-shows as a share of visits that are over (seen + no-show), 0–100, or
 * null when nothing has happened yet.
 */
export function noShowRate(counts: Pick<ReportCounts, "seen" | "noShow">): number | null {
  const over = counts.seen + counts.noShow;
  return over === 0 ? null : Math.round((counts.noShow / over) * 100);
}

type Json = Record<string, unknown>;
const n = (value: unknown) => (typeof value === "number" ? value : Number(value ?? 0) || 0);
const nOrNull = (value: unknown) =>
  value === null || value === undefined || Number.isNaN(Number(value)) ? null : Number(value);

export function mapReport(payload: Json): VisitReport {
  const totals = (payload.totals ?? {}) as Json;
  return {
    fromYmd: String(payload.from ?? ""),
    toYmd: String(payload.to ?? ""),
    totals: {
      booked: n(totals.booked),
      seen: n(totals.seen),
      noShow: n(totals.no_show),
      cancelled: n(totals.cancelled),
      upcoming: n(totals.upcoming),
      avgWaitMinutes: nOrNull(totals.avg_wait_minutes),
      avgVisitMinutes: nOrNull(totals.avg_visit_minutes),
    },
    doctors: ((payload.doctors ?? []) as Json[]).map((row) => ({
      doctorId: String(row.doctor_id ?? ""),
      name: String(row.name ?? "Doctor"),
      booked: n(row.booked),
      seen: n(row.seen),
      noShow: n(row.no_show),
      cancelled: n(row.cancelled),
      avgWaitMinutes: nOrNull(row.avg_wait_minutes),
    })),
    days: ((payload.days ?? []) as Json[]).map((row) => ({
      dateYmd: String(row.date ?? ""),
      booked: n(row.booked),
      seen: n(row.seen),
      noShow: n(row.no_show),
    })),
  };
}

export const reportsService = {
  /** Admin only: attendance, no-shows and waiting times for a date range. */
  async visitReport(fromYmd: string, toYmd: string): Promise<VisitReport> {
    const { data, error } = await supabase.rpc("visit_report", { p_from: fromYmd, p_to: toYmd });
    if (error) {
      throw new ReportError(error.message || "Could not load the report.");
    }
    const payload = (data ?? {}) as Json;
    if (payload.success === false) {
      throw new ReportError(
        payload.code === "FORBIDDEN"
          ? "Only administrators can see reports."
          : "Choose a date range of up to a year.",
      );
    }
    return mapReport(payload);
  },
};
