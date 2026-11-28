export type NotificationEventType =
  | "booking_pending_doctor"
  | "booking_pending_patient"
  | "visit_confirmed"
  | "visit_cancelled"
  | "visit_rescheduled"
  | "visit_rescheduled_doctor"
  | "visit_completed"
  | "visit_booked"
  | "visit_missed"
  | "queue_called"
  | "queue_next"
  | "reminder_day_before"
  | "reminder_same_day"
  | "follow_up_booked"
  | "waitlist_booked";

export interface AppointmentContext {
  appointmentDate: string;
  startTime: string;
  /** Set for clinic-session bookings (first come, first served). */
  sessionEndTime?: string | null;
  /** Why the clinic session was cancelled, when it was. */
  cancelReason?: string | null;
  appointmentType: string;
  patientName: string;
  doctorName: string;
  room?: string | null;
  videoUrl?: string | null;
  address?: string | null;
  /** Arrival number in the session queue, once checked in. */
  queueNumber?: number | null;
  /** From hospital_info.name (falls back to "FAME Hospital"). */
  hospitalName?: string | null;
}

function hospitalNameOf(ctx: AppointmentContext): string {
  return ctx.hospitalName?.trim() || "FAME Hospital";
}

/** "Dr. Ada Obi", without doubling a title the name already has. */
function drName(ctx: AppointmentContext): string {
  const name = ctx.doctorName.trim();
  return /^dr\.?\s/i.test(name) ? name : `Dr. ${name}`;
}

function roomSuffix(ctx: AppointmentContext): string {
  if (!ctx.room) return "";
  return /^\d/.test(ctx.room) ? `, Room ${ctx.room}` : `, ${ctx.room}`;
}

function formatWhen(ctx: AppointmentContext): string {
  if (ctx.sessionEndTime) {
    return `${ctx.appointmentDate}, ${ctx.startTime.slice(0, 5)}–${ctx.sessionEndTime.slice(0, 5)} clinic`;
  }
  return `${ctx.appointmentDate} at ${ctx.startTime.slice(0, 5)}`;
}

function typeLabel(type: string): string {
  if (type === "telehealth") return "Telehealth";
  if (type === "home-visit") return "Home visit";
  return "In clinic";
}

export function buildPushContent(
  eventType: NotificationEventType,
  ctx: AppointmentContext,
): { title: string; body: string } {
  const when = formatWhen(ctx);
  switch (eventType) {
    case "booking_pending_doctor":
      return {
        title: "New booking",
        body: `${ctx.patientName} requested a visit on ${when}.`,
      };
    case "booking_pending_patient":
      return {
        title: "Booking received",
        body: `Your visit with ${drName(ctx)} on ${when} is awaiting confirmation.`,
      };
    case "visit_confirmed": {
      let extra = "";
      if (ctx.appointmentType === "telehealth" && ctx.videoUrl) {
        extra = " Video link is in the app.";
      } else if (ctx.appointmentType === "in-clinic" && ctx.room) {
        extra = ` Room: ${ctx.room}.`;
      } else if (ctx.appointmentType === "home-visit" && ctx.address) {
        extra = ` Address on file.`;
      }
      return {
        title: "Visit confirmed",
        body: `${drName(ctx)} confirmed your ${typeLabel(ctx.appointmentType).toLowerCase()} visit on ${when}.${extra}`,
      };
    }
    case "visit_cancelled":
      return {
        title: "Visit cancelled",
        body: ctx.cancelReason
          ? `${drName(ctx)}'s clinic on ${when} was cancelled: ${ctx.cancelReason}. Please book another session.`
          : `The visit on ${when} with ${drName(ctx)} was cancelled.`,
      };
    case "visit_rescheduled":
      return {
        title: "Visit rescheduled",
        body: `Your visit with ${drName(ctx)} is now on ${when}.`,
      };
    case "visit_rescheduled_doctor":
      return {
        title: "Patient rescheduled",
        body: `${ctx.patientName} moved their visit to ${when}.`,
      };
    case "visit_completed":
      return {
        title: "Visit complete",
        body: `Your visit with ${drName(ctx)} on ${when} is marked complete.`,
      };
    case "visit_booked":
      return {
        title: "Visit booked",
        body: `You're booked with ${drName(ctx)}: ${when}${roomSuffix(ctx)}. Patients are seen in order of arrival, so come early.`,
      };
    case "visit_missed":
      return {
        title: "Visit missed",
        body: `${ctx.patientName}'s visit to ${drName(ctx)}'s clinic on ${when} was recorded as missed. Book another session in the app when you're ready.`,
      };
    case "queue_called":
      return {
        title: ctx.queueNumber ? `It's your turn (#${ctx.queueNumber})` : "It's your turn",
        body: `${drName(ctx)} is ready to see ${ctx.patientName} now${roomSuffix(ctx)}.`,
      };
    case "queue_next":
      return {
        title: "You're next",
        body: `${ctx.patientName} is next in line for ${drName(ctx)}. Please stay close to the clinic.`,
      };
    case "reminder_day_before":
      return {
        title: "Visit tomorrow",
        body: `Reminder: ${ctx.patientName} is booked with ${drName(ctx)} tomorrow, ${when}${roomSuffix(ctx)}. Patients are seen in order of arrival. Check in at reception with the app.`,
      };
    case "reminder_same_day":
      return {
        title: "Visit today",
        body: `Today: ${ctx.patientName} with ${drName(ctx)}, ${when}${roomSuffix(ctx)}. Scan the check-in code at reception when you arrive.`,
      };
    case "follow_up_booked":
      return {
        title: "Follow-up booked",
        body: `${drName(ctx)} booked a follow-up for ${ctx.patientName}: ${when}${roomSuffix(ctx)}. You can change or cancel it in the app.`,
      };
    case "waitlist_booked":
      return {
        title: "You got a place",
        body: `A place opened up: ${ctx.patientName} is now booked with ${drName(ctx)}, ${when}${roomSuffix(ctx)}. Can't make it? Cancel in the app so someone else can come.`,
      };
    default:
      return { title: hospitalNameOf(ctx), body: "You have a scheduling update." };
  }
}

export function buildSmsBody(
  eventType: NotificationEventType,
  ctx: AppointmentContext,
): string {
  const push = buildPushContent(eventType, ctx);
  const text = `${push.title}: ${push.body}`;
  return text.length <= 160 ? text : `${push.title}. ${formatWhen(ctx)}. Open the app for details.`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Only https links are rendered as anchors; anything else is shown as text. */
function safeHttpsUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export function buildEmailContent(
  eventType: NotificationEventType,
  ctx: AppointmentContext,
): { subject: string; text: string; html: string } {
  const push = buildPushContent(eventType, ctx);
  const hospital = hospitalNameOf(ctx);
  const subject = `${hospital} — ${push.title}`;
  const text = `${push.body}\n\nVisit type: ${typeLabel(ctx.appointmentType)}\nWhen: ${formatWhen(ctx)}\nDoctor: ${ctx.doctorName}\nPatient: ${ctx.patientName}`;

  let details = "";
  if (ctx.appointmentType === "telehealth" && ctx.videoUrl) {
    const href = safeHttpsUrl(ctx.videoUrl);
    details = href
      ? `<p>Video link: <a href="${escapeHtml(href)}">${escapeHtml(href)}</a></p>`
      : `<p>Video link: open the ${escapeHtml(hospital)} app.</p>`;
  } else if (ctx.appointmentType === "in-clinic" && ctx.room) {
    details = `<p>Room: ${escapeHtml(ctx.room)}</p>`;
  } else if (ctx.appointmentType === "home-visit" && ctx.address) {
    details = `<p>Address: ${escapeHtml(ctx.address)}</p>`;
  }

  const html = `<p>${escapeHtml(push.body)}</p><p><strong>When:</strong> ${escapeHtml(formatWhen(ctx))}</p><p><strong>Type:</strong> ${escapeHtml(typeLabel(ctx.appointmentType))}</p>${details}<p>Open the ${escapeHtml(hospital)} app for details.</p>`;

  return { subject, text, html };
}
