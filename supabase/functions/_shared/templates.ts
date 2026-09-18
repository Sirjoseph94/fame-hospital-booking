export type NotificationEventType =
  | "booking_pending_doctor"
  | "booking_pending_patient"
  | "visit_confirmed"
  | "visit_cancelled"
  | "visit_rescheduled"
  | "visit_rescheduled_doctor"
  | "visit_completed";

export interface AppointmentContext {
  appointmentDate: string;
  startTime: string;
  appointmentType: string;
  patientName: string;
  doctorName: string;
  room?: string | null;
  videoUrl?: string | null;
  address?: string | null;
}

function formatWhen(ctx: AppointmentContext): string {
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
        body: `Your visit with Dr. ${ctx.doctorName} on ${when} is awaiting confirmation.`,
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
        body: `Dr. ${ctx.doctorName} confirmed your ${typeLabel(ctx.appointmentType).toLowerCase()} visit on ${when}.${extra}`,
      };
    }
    case "visit_cancelled":
      return {
        title: "Visit cancelled",
        body: `The visit on ${when} with Dr. ${ctx.doctorName} was cancelled.`,
      };
    case "visit_rescheduled":
      return {
        title: "Visit rescheduled",
        body: `Your visit with Dr. ${ctx.doctorName} is now on ${when}.`,
      };
    case "visit_rescheduled_doctor":
      return {
        title: "Patient rescheduled",
        body: `${ctx.patientName} moved their visit to ${when}.`,
      };
    case "visit_completed":
      return {
        title: "Visit complete",
        body: `Your visit with Dr. ${ctx.doctorName} on ${when} is marked complete.`,
      };
    default:
      return { title: "FAME Hospital", body: "You have a scheduling update." };
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

export function buildEmailContent(
  eventType: NotificationEventType,
  ctx: AppointmentContext,
): { subject: string; text: string; html: string } {
  const push = buildPushContent(eventType, ctx);
  const subject = `FAME Hospital — ${push.title}`;
  const text = `${push.body}\n\nVisit type: ${typeLabel(ctx.appointmentType)}\nWhen: ${formatWhen(ctx)}\nDoctor: ${ctx.doctorName}\nPatient: ${ctx.patientName}`;

  let details = "";
  if (ctx.appointmentType === "telehealth" && ctx.videoUrl) {
    details = `<p>Video link: <a href="${ctx.videoUrl}">${ctx.videoUrl}</a></p>`;
  } else if (ctx.appointmentType === "in-clinic" && ctx.room) {
    details = `<p>Room: ${ctx.room}</p>`;
  } else if (ctx.appointmentType === "home-visit" && ctx.address) {
    details = `<p>Address: ${ctx.address}</p>`;
  }

  const html = `<p>${push.body}</p><p><strong>When:</strong> ${formatWhen(ctx)}</p><p><strong>Type:</strong> ${typeLabel(ctx.appointmentType)}</p>${details}<p>Open the FAME Hospital app for details.</p>`;

  return { subject, text, html };
}
