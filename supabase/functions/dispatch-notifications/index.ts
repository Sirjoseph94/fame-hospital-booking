import {
  createClient,
  type SupabaseClient,
} from "https://esm.sh/@supabase/supabase-js@2.45.4";

/** Service-role client (untyped schema: rows are plain records). */
type Db = SupabaseClient;
import {
  buildEmailContent,
  buildPushContent,
  buildSmsBody,
  type AppointmentContext,
  type NotificationEventType,
} from "../_shared/templates.ts";

const corsHeaders = {
  // Server-to-server only (Database Webhook); no browser origins allowed.
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-webhook-secret",
};

interface DeliveryRow {
  id: string;
  recipient_id: string;
  appointment_id: string | null;
  event_type: string;
  channel: "email" | "sms" | "push";
  status: string;
}

interface WebhookPayload {
  type?: string;
  record?: DeliveryRow;
  delivery_id?: string;
  /** Scheduled sweep: recover stuck rows and retry pending ones. */
  sweep?: boolean;
}

/** Attempts before a delivery is marked `failed` for good. */
const MAX_ATTEMPTS = 3;
/** A row `processing` longer than this is assumed to have crashed mid-send. */
const STUCK_AFTER_MS = 10 * 60 * 1000;
/** Pending rows younger than this are left to the webhook invocation. */
const RETRY_AFTER_MS = 60 * 1000;
/** Max deliveries handled per sweep call. */
const SWEEP_BATCH = 50;

function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  let diff = ab.length ^ bb.length;
  const len = Math.max(ab.length, bb.length);
  for (let i = 0; i < len; i += 1) {
    diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0);
  }
  return diff === 0;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function loadAppointmentContext(
  supabase: Db,
  appointmentId: string,
): Promise<AppointmentContext | null> {
  const { data: appt, error } = await supabase
    .from("appointments")
    .select(
      "appointment_date, start_time, appointment_type, room, video_url, address, patient_id, doctor_id",
    )
    .eq("id", appointmentId)
    .maybeSingle();

  if (error || !appt) {
    return null;
  }

  const ids = [appt.patient_id, appt.doctor_id].filter(Boolean);
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name")
    .in("id", ids);

  const byId = new Map(
    (profiles ?? []).map((p: { id: string; full_name: string }) => [
      p.id,
      p.full_name,
    ]),
  );

  return {
    appointmentDate: appt.appointment_date as string,
    startTime: appt.start_time as string,
    appointmentType: appt.appointment_type as string,
    patientName: byId.get(appt.patient_id) ?? "Patient",
    doctorName: byId.get(appt.doctor_id) ?? "Doctor",
    room: appt.room,
    videoUrl: appt.video_url,
    address: appt.address,
  };
}

async function sendEmail(
  to: string,
  eventType: NotificationEventType,
  ctx: AppointmentContext,
): Promise<void> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("NOTIFICATION_FROM_EMAIL");
  if (!apiKey || !from) {
    throw new Error("Email provider is not configured.");
  }

  const { subject, text, html } = buildEmailContent(eventType, ctx);
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to, subject, text, html }),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Resend error: ${detail}`);
  }
}

async function sendSms(to: string, body: string): Promise<void> {
  const sid = Deno.env.get("TWILIO_ACCOUNT_SID");
  const token = Deno.env.get("TWILIO_AUTH_TOKEN");
  const from = Deno.env.get("TWILIO_FROM_NUMBER");
  if (!sid || !token || !from) {
    throw new Error("SMS provider is not configured.");
  }

  const auth = btoa(`${sid}:${token}`);
  const params = new URLSearchParams({ To: to, From: from, Body: body });
  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    },
  );

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Twilio error: ${detail}`);
  }
}

async function sendExpoPush(
  tokens: string[],
  title: string,
  body: string,
): Promise<string[]> {
  if (tokens.length === 0) {
    return [];
  }

  const messages = tokens.map((to) => ({
    to,
    sound: "default",
    title,
    body,
  }));

  const res = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(messages),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Expo push error: ${detail}`);
  }

  const json = (await res.json()) as {
    data?: { status: string; message?: string; details?: { error?: string } }[];
  };

  const stale: string[] = [];
  json.data?.forEach((item, index) => {
    if (
      item.status === "error" &&
      item.details?.error === "DeviceNotRegistered"
    ) {
      stale.push(tokens[index]!);
    }
  });
  return stale;
}

function normalizePhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 10) return null;
  if (phone.trim().startsWith("+")) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  return `+${digits}`;
}

async function processDelivery(
  supabase: Db,
  deliveryId: string,
): Promise<{ id: string; status: string }> {
  // Atomically claim the row: only one invocation (webhook retry, manual
  // replay, concurrent call) can move it from pending → processing.
  const { data: claimed, error: claimError } = await supabase
    .from("notification_deliveries")
    .update({ status: "processing", claimed_at: new Date().toISOString() })
    .eq("id", deliveryId)
    .eq("status", "pending")
    .select("*")
    .maybeSingle();

  if (claimError) {
    throw new Error(claimError.message);
  }

  if (!claimed) {
    const { data: existing } = await supabase
      .from("notification_deliveries")
      .select("id, status")
      .eq("id", deliveryId)
      .maybeSingle();
    if (!existing) {
      throw new Error("Delivery not found.");
    }
    return { id: existing.id as string, status: existing.status as string };
  }

  const row = claimed as DeliveryRow & { attempts?: number };

  const mark = async (
    requested: "sent" | "skipped" | "failed",
    error?: string,
  ) => {
    const attempts = (row.attempts ?? 0) + 1;
    // A failed send goes back to `pending` for the sweep to retry, until the
    // attempt limit is reached.
    const status =
      requested === "failed" && attempts < MAX_ATTEMPTS ? "pending" : requested;
    const { error: markError } = await supabase
      .from("notification_deliveries")
      .update({
        status,
        error: error ?? null,
        attempts,
        processed_at: new Date().toISOString(),
      })
      .eq("id", row.id);
    if (markError) {
      console.error(`Failed to mark delivery ${row.id} as ${status}`, markError);
    }
    return { id: row.id, status };
  };

  const { data: prefs } = await supabase
    .from("notification_preferences")
    .select("email_opt_in, sms_opt_in, push_opt_in")
    .eq("user_id", row.recipient_id)
    .maybeSingle();

  const emailOptIn = prefs?.email_opt_in === true;
  const smsOptIn = prefs?.sms_opt_in === true;
  const pushOptIn = prefs?.push_opt_in === true;

  const { data: profile } = await supabase
    .from("profiles")
    .select("phone")
    .eq("id", row.recipient_id)
    .maybeSingle();

  const { data: authUser } = await supabase.auth.admin.getUserById(
    row.recipient_id,
  );
  const email = authUser.user?.email ?? null;

  let ctx: AppointmentContext = {
    appointmentDate: "",
    startTime: "",
    appointmentType: "in-clinic",
    patientName: "Patient",
    doctorName: "Doctor",
  };

  if (row.appointment_id) {
    const loaded = await loadAppointmentContext(supabase, row.appointment_id);
    if (loaded) ctx = loaded;
  }

  const eventType = row.event_type as NotificationEventType;

  try {
    if (row.channel === "email") {
      if (!emailOptIn) return mark("skipped", "email_opt_out");
      if (!email) return mark("skipped", "no_email");
      await sendEmail(email, eventType, ctx);
      return mark("sent");
    }

    if (row.channel === "sms") {
      if (!smsOptIn) return mark("skipped", "sms_opt_out");
      const phone = normalizePhone(profile?.phone as string | null);
      if (!phone) return mark("skipped", "no_phone");
      await sendSms(phone, buildSmsBody(eventType, ctx));
      return mark("sent");
    }

    if (row.channel === "push") {
      if (!pushOptIn) return mark("skipped", "push_opt_out");
      const { data: tokens } = await supabase
        .from("push_device_tokens")
        .select("expo_push_token")
        .eq("user_id", row.recipient_id);

      const tokenList = (tokens ?? []).map(
        (t: { expo_push_token: string }) => t.expo_push_token,
      );
      if (tokenList.length === 0) return mark("skipped", "no_push_tokens");

      const { title, body } = buildPushContent(eventType, ctx);
      const stale = await sendExpoPush(tokenList, title, body);
      if (stale.length > 0) {
        await supabase
          .from("push_device_tokens")
          .delete()
          .in("expo_push_token", stale);
      }
      return mark("sent");
    }

    return mark("failed", "unknown_channel");
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "send_failed";
    return await mark("failed", message);
  }
}

/**
 * Recovery pass (call on a schedule): reset rows stuck in `processing`, then
 * process pending rows that the webhook missed or that failed and are due a
 * retry. processDelivery's atomic claim keeps this safe alongside webhooks.
 */
async function sweep(
  supabase: Db,
): Promise<{ recovered: number; processed: { id: string; status: string }[] }> {
  const stuckBefore = new Date(Date.now() - STUCK_AFTER_MS).toISOString();
  const { data: recovered, error: recoverError } = await supabase
    .from("notification_deliveries")
    .update({ status: "pending", error: "recovered_after_stuck_processing" })
    .eq("status", "processing")
    .lt("claimed_at", stuckBefore)
    .select("id");
  if (recoverError) {
    throw new Error(recoverError.message);
  }

  const retryBefore = new Date(Date.now() - RETRY_AFTER_MS).toISOString();
  const { data: due, error: dueError } = await supabase
    .from("notification_deliveries")
    .select("id")
    .eq("status", "pending")
    .lt("attempts", MAX_ATTEMPTS)
    .lt("created_at", retryBefore)
    .order("created_at", { ascending: true })
    .limit(SWEEP_BATCH);
  if (dueError) {
    throw new Error(dueError.message);
  }

  const processed: { id: string; status: string }[] = [];
  for (const { id } of (due ?? []) as { id: string }[]) {
    try {
      processed.push(await processDelivery(supabase, id));
    } catch (cause) {
      processed.push({
        id,
        status: cause instanceof Error ? `error: ${cause.message}` : "error",
      });
    }
  }
  return { recovered: recovered?.length ?? 0, processed };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Only the Database Webhook (or an operator) may invoke this function.
  // Fails closed when the secret is not configured.
  const expectedSecret = Deno.env.get("NOTIFICATION_WEBHOOK_SECRET");
  if (!expectedSecret) {
    return jsonResponse({ error: "webhook secret not configured" }, 500);
  }
  if (!timingSafeEqual(req.headers.get("x-webhook-secret") ?? "", expectedSecret)) {
    return jsonResponse({ error: "unauthorized" }, 401);
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "method not allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    const body = (await req.json()) as WebhookPayload;
    if (body.sweep === true) {
      return jsonResponse({ ok: true, ...(await sweep(supabase)) });
    }

    const deliveryId =
      body.delivery_id ??
      body.record?.id ??
      (body as { id?: string }).id;

    if (!deliveryId) {
      return jsonResponse({ error: "delivery_id required" }, 400);
    }

    const result = await processDelivery(supabase, deliveryId);
    return jsonResponse({ ok: true, ...result });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "unknown_error";
    return jsonResponse({ error: message }, 500);
  }
});
