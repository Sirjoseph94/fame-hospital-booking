import { QueryClient } from "@tanstack/react-query";

import { invalidateScheduling, queryKeys } from "@/lib/query/keys";

describe("invalidateScheduling", () => {
  it("marks appointments, slots and doctors stale, and nothing else", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
    const seeded = {
      patientAppointments: queryKeys.appointments.patient("u1"),
      doctorAgenda: queryKeys.appointments.doctorRange("d1", "2026-11-23", "2026-11-29"),
      adminAppointments: queryKeys.appointments.admin("pending"),
      bookableSlots: queryKeys.slots.bookable("d1"),
      capacity: queryKeys.slots.capacityDay("2026-11-24"),
      doctorList: queryKeys.doctors.list,
      doctorDetail: queryKeys.doctors.detail("d1"),
      profile: queryKeys.profile.patient("u1"),
      settings: queryKeys.settings,
      beneficiaries: queryKeys.beneficiaries("u1"),
      invites: queryKeys.invites,
    };
    for (const key of Object.values(seeded)) {
      client.setQueryData(key, { seeded: true });
    }

    await invalidateScheduling(client);

    const stale = (key: readonly unknown[]) => client.getQueryState(key)?.isInvalidated;
    for (const key of [
      seeded.patientAppointments,
      seeded.doctorAgenda,
      seeded.adminAppointments,
      seeded.bookableSlots,
      seeded.capacity,
      seeded.doctorList,
      seeded.doctorDetail,
    ]) {
      expect(stale(key)).toBe(true);
    }
    for (const key of [seeded.profile, seeded.settings, seeded.beneficiaries, seeded.invites]) {
      expect(stale(key)).toBe(false);
    }
    client.clear();
  });

  it("scopes keys per user so one account's data never matches another's", () => {
    expect(queryKeys.appointments.patient("u1")).not.toEqual(queryKeys.appointments.patient("u2"));
    expect(queryKeys.beneficiaries("u1")).not.toEqual(queryKeys.beneficiaries("u2"));
    expect(queryKeys.profile.patient("u1")).not.toEqual(queryKeys.profile.patient("u2"));
  });
});
