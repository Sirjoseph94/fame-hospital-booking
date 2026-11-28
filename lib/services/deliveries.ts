import { supabase } from "@/lib/supabase";

import { updateTitle, type UpdateChannel } from "@/lib/services/updates";

export interface FailedDelivery {
  id: string;
  recipientName: string;
  eventType: string;
  channel: UpdateChannel;
  error: string | null;
  attempts: number;
  createdAt: string;
}

interface FailedRow {
  id: string;
  event_type: string;
  channel: UpdateChannel;
  error: string | null;
  attempts: number | null;
  created_at: string;
  recipient: { full_name?: string } | { full_name?: string }[] | null;
}

export class DeliveryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeliveryError";
  }
}

/** Admin-facing description, e.g. "Visit booked (SMS)". */
export function describeDelivery(delivery: Pick<FailedDelivery, "eventType" | "channel">): string {
  const channel = delivery.channel === "sms" ? "SMS" : delivery.channel;
  // Doctor events have their own wording in templates; keep it simple here.
  const title = delivery.eventType.endsWith("_doctor")
    ? updateTitle(delivery.eventType.replace(/_doctor$/, "").replace("booking_pending", "visit_booked"))
    : updateTitle(delivery.eventType);
  return `${title} (${channel})`;
}

export const deliveriesService = {
  /** Admin: most recent failed deliveries (RLS: admins read all). */
  async listFailed(limit = 50): Promise<FailedDelivery[]> {
    const { data, error } = await supabase
      .from("notification_deliveries")
      .select("id, event_type, channel, error, attempts, created_at, recipient:profiles(full_name)")
      .eq("status", "failed")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      throw new DeliveryError(error.message || "Could not load failed messages.");
    }
    return ((data ?? []) as unknown as FailedRow[]).map((row) => {
      const recipient = Array.isArray(row.recipient) ? row.recipient[0] : row.recipient;
      return {
        id: row.id,
        recipientName: recipient?.full_name?.trim() || "Former user",
        eventType: row.event_type,
        channel: row.channel,
        error: row.error,
        attempts: row.attempts ?? 0,
        createdAt: row.created_at,
      };
    });
  },

  /** Admin: queue a failed delivery to be sent again by the retry sweep. */
  async retry(deliveryId: string): Promise<void> {
    const { data, error } = await supabase.rpc("retry_notification_delivery", {
      p_delivery_id: deliveryId,
    });
    if (error) {
      throw new DeliveryError(error.message || "Could not retry the message.");
    }
    const result = (data ?? {}) as { success?: boolean; code?: string };
    if (!result.success) {
      throw new DeliveryError(
        result.code === "NOT_MODIFIABLE"
          ? "This message is no longer marked as failed."
          : "Only administrators can retry messages.",
      );
    }
  },
};
