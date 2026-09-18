import type {
  Appointment,
  AppointmentType,
  Beneficiary,
  Doctor,
} from "@/types/scheduling";

export function pickSelfBeneficiary(
  beneficiaries: Beneficiary[],
): Beneficiary | undefined {
  return beneficiaries.find(
    (beneficiary) => beneficiary.relationship === "self",
  );
}

export function lastBookedDoctorId(
  appointments: Appointment[],
): { doctorId: string; appointmentType: AppointmentType } | null {
  const candidates = appointments.filter(
    (appointment) => appointment.status !== "cancelled",
  );
  if (candidates.length === 0) {
    return null;
  }
  const latest = candidates[candidates.length - 1];
  return {
    doctorId: latest.doctorId,
    appointmentType: latest.type,
  };
}

export function doctorNameById(
  doctors: Doctor[],
  doctorId: string,
): string | null {
  return doctors.find((doctor) => doctor.id === doctorId)?.name ?? null;
}

export function nextUpcomingAppointment(
  appointments: Appointment[],
): Appointment | null {
  const upcoming = appointments
    .filter((appointment) => appointment.status === "upcoming")
    .sort((left, right) => {
      const leftTime = left.startsAt ? new Date(left.startsAt).getTime() : 0;
      const rightTime = right.startsAt ? new Date(right.startsAt).getTime() : 0;
      return leftTime - rightTime;
    });
  return upcoming[0] ?? null;
}
