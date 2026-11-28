import {
  localIso,
  mapAppointment,
  mapDoctor,
  mapDoctorDetail,
  mapNextOpenSession,
  mapSession,
  type AppointmentRow,
  type DoctorRow,
} from "@/lib/services/scheduling/mappers";

// Tests run with TZ=UTC (see package.json), so local wall-clock times map to Z.

const row = (overrides: Partial<DoctorRow> = {}): DoctorRow => ({
  id: "d1",
  specialty: "GP",
  department: "Outpatients",
  is_accepting_bookings: true,
  is_active: true,
  profile: { full_name: "Dr. Ada", is_active: true },
  ...overrides,
});

const appointmentRow = (overrides: Partial<AppointmentRow> = {}): AppointmentRow => ({
  id: "a1",
  account_holder_id: "u1",
  beneficiary_id: "b1",
  patient_id: "u1",
  doctor_id: "d1",
  session_id: "s1",
  appointment_date: "2026-12-01",
  start_time: "09:00:00",
  appointment_type: "in-clinic",
  status: "confirmed",
  room: null,
  video_url: null,
  address: null,
  reason: "Cough",
  notes: null,
  session: { session_date: "2026-12-01", start_time: "09:00:00", end_time: "12:30:00" },
  ...overrides,
});

describe("localIso", () => {
  it("accepts HH:mm and HH:mm:ss times", () => {
    expect(localIso("2026-11-24", "09:30")).toBe("2026-11-24T09:30:00.000Z");
    expect(localIso("2026-11-24", "09:30:00")).toBe("2026-11-24T09:30:00.000Z");
  });
});

describe("session mappers", () => {
  it("maps an availability row", () => {
    expect(
      mapSession({
        session_id: "s1",
        doctor_id: "d1",
        session_date: "2026-12-01",
        start_time: "09:00:00",
        end_time: "13:00:00",
        capacity: 20,
        status: "scheduled",
        cancel_reason: null,
        booked_count: 18,
        places_left: 2,
        is_bookable: true,
        room: "Room 4",
      }),
    ).toEqual({
      id: "s1",
      doctorId: "d1",
      dateYmd: "2026-12-01",
      startsAt: "2026-12-01T09:00:00.000Z",
      endsAt: "2026-12-01T13:00:00.000Z",
      capacity: 20,
      bookedCount: 18,
      placesLeft: 2,
      status: "scheduled",
      room: "Room 4",
      cancelReason: undefined,
      isBookable: true,
    });
  });

  it("keeps a cancellation reason and maps unknown statuses to scheduled", () => {
    const base = {
      session_id: "s1", doctor_id: "d1", session_date: "2026-12-01", start_time: "09:00",
      end_time: "10:00", capacity: 5, booked_count: 0, places_left: 5, is_bookable: false, room: null,
    };
    expect(mapSession({ ...base, status: "cancelled", cancel_reason: "Leave" })).toMatchObject({
      status: "cancelled",
      cancelReason: "Leave",
    });
    expect(mapSession({ ...base, status: "weird", cancel_reason: null }).status).toBe("scheduled");
  });

  it("maps the next open session", () => {
    expect(
      mapNextOpenSession({
        doctor_id: "d1", session_id: "s9", session_date: "2026-12-02",
        start_time: "14:00:00", end_time: "17:00:00", places_left: 3,
      }),
    ).toEqual({
      sessionId: "s9",
      startsAt: "2026-12-02T14:00:00.000Z",
      endsAt: "2026-12-02T17:00:00.000Z",
      placesLeft: 3,
    });
  });
});

describe("mapAppointment", () => {
  it("uses the session window", () => {
    expect(mapAppointment(appointmentRow())).toMatchObject({
      id: "a1",
      sessionId: "s1",
      startsAt: "2026-12-01T09:00:00.000Z",
      endsAt: "2026-12-01T12:30:00.000Z",
      status: "upcoming",
      dbStatus: "confirmed",
      reason: "Cough",
    });
  });

  it("accepts the session join as a one-element array", () => {
    const mapped = mapAppointment(
      appointmentRow({ session: [{ session_date: "2026-12-03", start_time: "08:00", end_time: "10:00" }] }),
    );
    expect(mapped.endsAt).toBe("2026-12-03T10:00:00.000Z");
  });

  it("takes the room from the session unless the booking has its own", () => {
    const withSessionRoom = appointmentRow({
      session: { session_date: "2026-12-01", start_time: "09:00", end_time: "12:00", room: "Room 7" },
    });
    expect(mapAppointment(withSessionRoom).room).toBe("Room 7");
    expect(mapAppointment({ ...withSessionRoom, room: "Room 2" }).room).toBe("Room 2");
  });

  it("flags bookings whose whole session was cancelled, with the reason", () => {
    const base = { session_date: "2026-12-01", start_time: "09:00", end_time: "12:00" };
    expect(
      mapAppointment(appointmentRow({ status: "cancelled", session: { ...base, status: "cancelled", cancel_reason: " Doctor unwell " } }))
        .sessionCancelled,
    ).toEqual({ reason: "Doctor unwell" });
    expect(
      mapAppointment(appointmentRow({ status: "cancelled", session: { ...base, status: "cancelled", cancel_reason: null } }))
        .sessionCancelled,
    ).toEqual({ reason: undefined });
    expect(mapAppointment(appointmentRow({ session: { ...base, status: "scheduled" } })).sessionCancelled).toBeUndefined();
  });

  it("falls back to the stored start + 30 min for bookings without a session", () => {
    const mapped = mapAppointment(
      appointmentRow({ session_id: null, session: null, start_time: "15:00", status: "pending" }),
    );
    expect(mapped).toMatchObject({
      sessionId: undefined,
      startsAt: "2026-12-01T15:00:00.000Z",
      endsAt: "2026-12-01T15:30:00.000Z",
      dbStatus: "pending",
    });
  });

  it("maps terminal statuses", () => {
    expect(mapAppointment(appointmentRow({ status: "completed" })).status).toBe("completed");
    expect(mapAppointment(appointmentRow({ status: "cancelled" })).status).toBe("cancelled");
  });
});

describe("doctor mappers", () => {
  it("keeps the raw booking flag separate from activation (DoctorDetail)", () => {
    expect(mapDoctorDetail(row({ is_active: false }))).toMatchObject({ acceptingBookingsFlag: true, isActive: false, name: "Dr. Ada" });
    expect(mapDoctorDetail(row({ profile: { full_name: "Dr. Ada", is_active: false } }))).toMatchObject({ isActive: false });
    expect(mapDoctorDetail(row({ profile: [{ full_name: "Dr. Array", is_active: true }] }))).toMatchObject({ name: "Dr. Array", isActive: true });
  });

  it("passes through a missing next session and folds activation into accepting", () => {
    expect(mapDoctor(row(), null).nextSession).toBeNull();
    expect(mapDoctor(row({ is_accepting_bookings: false }), null).isAcceptingBookings).toBe(false);
    expect(mapDoctor(row({ profile: { full_name: "Dr. Ada", is_active: false } }), null).isAcceptingBookings).toBe(false);
  });
});
