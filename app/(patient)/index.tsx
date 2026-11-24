import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import * as Linking from "expo-linking";

import { AddBeneficiarySheet } from "@/components/patient/add-beneficiary-sheet";
import { SetupSelfBeneficiarySheet } from "@/components/patient/setup-self-beneficiary-sheet";
import { HospitalFooter } from "@/components/patient/hospital-footer";
import { BeneficiaryPill } from "@/components/ui/beneficiary-pill";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SchedulingStatePanel } from "@/components/ui/scheduling-state-panel";
import {
  HomeScreenSkeleton,
  ScreenLoadingSkeleton,
} from "@/components/ui/skeleton";
import { Sheet } from "@/components/ui/sheet";
import { VisitCard } from "@/components/ui/visit-card";
import { ShellHeader } from "@/components/shell-header";
import { confirmAsync } from "@/lib/confirm";
import { useNow } from "@/lib/hooks/use-now";
import { useBreakpoint } from "@/lib/platform";
import { telehealthJoinState } from "@/lib/telehealth-join";
import {
  doctorNameById,
  lastBookedDoctorId,
  nextUpcomingAppointment,
  pickSelfBeneficiary,
} from "@/lib/patient-booking-helpers";
import { useBookingStore } from "@/lib/stores/booking";
import { usePatientBookingPrefs } from "@/lib/stores/patient-booking-prefs";
import { useSessionStore } from "@/lib/stores/session";
import {
  SchedulingError,
  schedulingService,
} from "@/lib/services/scheduling";
import type { AddBeneficiaryFields } from "@/components/patient/add-beneficiary-sheet";
import type { SetupSelfBeneficiaryFields } from "@/components/patient/setup-self-beneficiary-sheet";
import type {
  AppointmentDbStatus,
  AppointmentType,
  Beneficiary,
  Doctor,
} from "@/types/scheduling";

export default function PatientHomeScreen() {
  const session = useSessionStore((state) => state.session);
  const userId = session?.userId;
  const breakpoint = useBreakpoint();

  const [beneficiaries, setBeneficiaries] = useState<Beneficiary[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [beneficiarySheetOpen, setBeneficiarySheetOpen] = useState(false);
  const [addPatientOpen, setAddPatientOpen] = useState(false);
  const [addPatientError, setAddPatientError] = useState<string | null>(null);
  const [addPatientSubmitting, setAddPatientSubmitting] = useState(false);
  const [setupSelfOpen, setSetupSelfOpen] = useState(false);
  const [setupSelfError, setSetupSelfError] = useState<string | null>(null);
  const [setupSelfSubmitting, setSetupSelfSubmitting] = useState(false);
  const preferredBeneficiaryId = usePatientBookingPrefs(
    (state) => state.selectedBeneficiaryId,
  );
  const setPreferredBeneficiaryId = usePatientBookingPrefs(
    (state) => state.setSelectedBeneficiaryId,
  );
  const resetBookingToSelf = usePatientBookingPrefs((state) => state.resetToSelf);
  const [upcomingVisit, setUpcomingVisit] = useState<{
    beneficiaryName: string;
    doctorName: string;
    startsAt: string;
    type: "in-clinic" | "telehealth" | "home-visit";
    dbStatus: AppointmentDbStatus;
    videoUrl?: string;
    room?: string;
    address?: string;
  } | null>(null);
  const [returningLine, setReturningLine] = useState<{
    doctorName: string;
    appointmentType: AppointmentType;
  } | null>(null);

  const [startingBooking, setStartingBooking] = useState(false);
  const hasLoadedRef = useRef(false);
  const startingBookingRef = useRef(false);

  // Re-render every minute so telehealth join windows stay current.
  useNow(60_000);

  const beginReturningFlow = useBookingStore((state) => state.beginReturningFlow);
  const beginStandardFlow = useBookingStore((state) => state.beginStandardFlow);

  const load = useCallback(async (options?: { silent?: boolean }) => {
    if (!userId) {
      return;
    }
    setError(null);
    if (!options?.silent) {
      setLoading(true);
    }
    try {
      const [initialBeneficiaries, doctorRows, appointmentRows] =
        await Promise.all([
          schedulingService.listBeneficiaries(userId),
          schedulingService.listDoctors(),
          schedulingService.listAppointments(userId),
        ]);
      let beneficiaryRows = initialBeneficiaries;
      if (!pickSelfBeneficiary(beneficiaryRows)) {
        const ensured = await schedulingService.ensureSelfBeneficiary(userId);
        if (ensured) {
          beneficiaryRows = await schedulingService.listBeneficiaries(userId);
        }
      }
      setBeneficiaries(beneficiaryRows);
      setDoctors(doctorRows);
      const self = pickSelfBeneficiary(beneficiaryRows);
      const lastBooking = lastBookedDoctorId(appointmentRows);
      if (
        lastBooking &&
        self &&
        lastBooking.appointmentType !== "home-visit" &&
        doctorNameById(doctorRows, lastBooking.doctorId)
      ) {
        setReturningLine({
          doctorName: doctorNameById(doctorRows, lastBooking.doctorId)!,
          appointmentType: lastBooking.appointmentType,
        });
      } else {
        setReturningLine(null);
      }
      const next = nextUpcomingAppointment(appointmentRows);
      if (!next?.startsAt) {
        setUpcomingVisit(null);
      } else {
        const beneficiary =
          beneficiaryRows.find((row) => row.id === next.beneficiaryId) ?? self;
        setUpcomingVisit({
          beneficiaryName: beneficiary?.displayName ?? "Patient",
          doctorName: doctorNameById(doctorRows, next.doctorId) ?? "Doctor",
          startsAt: next.startsAt,
          type: next.type,
          dbStatus: next.dbStatus,
          videoUrl: next.videoUrl,
          room: next.room,
          address: next.address,
        });
      }
    } catch (cause) {
      const message =
        cause instanceof SchedulingError
          ? cause.message
          : "Could not load your home screen.";
      setError(message);
    } finally {
      hasLoadedRef.current = true;
      setLoading(false);
    }
  }, [userId]);

  // Runs on first focus and silently refreshes whenever Home regains focus
  // (e.g. returning from the booking flow), so the upcoming card isn't stale.
  useFocusEffect(
    useCallback(() => {
      const task = setTimeout(
        () => void load({ silent: hasLoadedRef.current }),
        0,
      );
      return () => clearTimeout(task);
    }, [load]),
  );

  useEffect(() => {
    if (!preferredBeneficiaryId || beneficiaries.length === 0) {
      return;
    }
    if (!beneficiaries.some((row) => row.id === preferredBeneficiaryId)) {
      resetBookingToSelf();
    }
  }, [beneficiaries, preferredBeneficiaryId, resetBookingToSelf]);

  const selfBeneficiary = useMemo(
    () => pickSelfBeneficiary(beneficiaries),
    [beneficiaries],
  );

  const bookingBeneficiary = useMemo(() => {
    if (preferredBeneficiaryId) {
      const preferred = beneficiaries.find(
        (row) => row.id === preferredBeneficiaryId,
      );
      if (preferred) {
        return preferred;
      }
    }
    return selfBeneficiary ?? null;
  }, [beneficiaries, preferredBeneficiaryId, selfBeneficiary]);

  const handleBookAppointment = async () => {
    if (startingBookingRef.current) {
      return;
    }
    if (!session || !bookingBeneficiary) {
      AccessibilityInfo.announceForAccessibility(
        "Set up booking for yourself before continuing.",
      );
      setSetupSelfOpen(true);
      return;
    }

    startingBookingRef.current = true;
    setStartingBooking(true);
    let appointments: Awaited<
      ReturnType<typeof schedulingService.listAppointments>
    >;
    try {
      appointments = await schedulingService.listAppointments(session.userId);
    } catch {
      // Fall back to the standard flow if history can't be loaded.
      appointments = [];
    } finally {
      startingBookingRef.current = false;
      setStartingBooking(false);
    }
    const last = lastBookedDoctorId(appointments);
    const self = selfBeneficiary;

    if (
      last &&
      self &&
      bookingBeneficiary.id === self.id &&
      last.appointmentType !== "home-visit" &&
      doctorNameById(doctors, last.doctorId)
    ) {
      const doctor = doctors.find((row) => row.id === last.doctorId);
      if (!doctor?.isAcceptingBookings) {
        AccessibilityInfo.announceForAccessibility(
          "This doctor is not accepting new bookings. Choose another doctor.",
        );
        beginStandardFlow(bookingBeneficiary.id);
        router.push("/book/doctor");
        return;
      }
      beginReturningFlow({
        beneficiaryId: self.id,
        doctorId: last.doctorId,
        doctorName: doctor.name,
        appointmentType: last.appointmentType,
      });
      router.push("/book/slot");
      return;
    }

    beginStandardFlow(bookingBeneficiary.id);
    router.push("/book/doctor");
  };

  const saveSelfBeneficiary = async (values: SetupSelfBeneficiaryFields) => {
    if (!session) {
      return;
    }
    setSetupSelfSubmitting(true);
    setSetupSelfError(null);
    try {
      const created = await schedulingService.createBeneficiary({
        accountHolderId: session.userId,
        displayName: values.displayName,
        relationship: "self",
        dob: values.dob,
        gender: values.gender,
      });
      setBeneficiaries((rows) => [...rows, created]);
      resetBookingToSelf();
      setSetupSelfOpen(false);
      AccessibilityInfo.announceForAccessibility(
        "You are set up to book for yourself.",
      );
    } catch (cause) {
      setSetupSelfError(
        cause instanceof Error
          ? cause.message
          : "Could not save your patient profile.",
      );
    } finally {
      setSetupSelfSubmitting(false);
    }
  };

  const saveBeneficiary = async (values: AddBeneficiaryFields) => {
    if (!session) {
      return;
    }
    setAddPatientSubmitting(true);
    setAddPatientError(null);
    try {
      const created = await schedulingService.createBeneficiary({
        accountHolderId: session.userId,
        displayName: values.displayName,
        relationship: values.relationship,
        dob: values.dob,
        gender: values.gender,
        nationalId: values.nationalId,
        hospitalFileId: values.hospitalFileId,
      });
      setBeneficiaries((rows) => [...rows, created]);
      setAddPatientOpen(false);
      void confirmAsync({
        title: `Added ${created.displayName}`,
        message:
          "Book an appointment for them now, or add them to your list only?",
        confirmText: "Book now",
        cancelText: "Add only",
      }).then((bookNow) => {
        if (!bookNow) {
          AccessibilityInfo.announceForAccessibility("Patient added.");
          return;
        }
        setPreferredBeneficiaryId(created.id);
        beginStandardFlow(created.id);
        AccessibilityInfo.announceForAccessibility(
          `Ready to book for ${created.displayName}.`,
        );
        router.push("/book/doctor");
      });
    } catch (cause) {
      setAddPatientError(
        cause instanceof Error ? cause.message : "Could not save patient.",
      );
    } finally {
      setAddPatientSubmitting(false);
    }
  };

  const isWide = breakpoint !== "phone";

  return (
    <View className="flex-1 bg-surface-muted">
      <ShellHeader title="Home" />
      {loading ? (
        <ScreenLoadingSkeleton>
          <HomeScreenSkeleton />
        </ScreenLoadingSkeleton>
      ) : error ? (
        <View className="flex-1 justify-center px-4">
          <SchedulingStatePanel
            message={error}
            onRetry={() => void load()}
          />
        </View>
      ) : (
        <ScrollView
          contentContainerClassName="gap-4 px-4 pb-8 pt-2"
          contentInsetAdjustmentBehavior="automatic"
        >
          <View className={isWide ? "flex-row gap-4" : "gap-4"}>
            <View className={isWide ? "flex-1 gap-4" : "gap-4"}>
              <Card style={{ gap: 12 }}>
                <Text className="text-base font-semibold text-ink">Book for</Text>
                {bookingBeneficiary ? (
                  <BeneficiaryPill
                    displayName={bookingBeneficiary.displayName}
                    relationship={bookingBeneficiary.relationship}
                    selected
                    onPress={() => setBeneficiarySheetOpen(true)}
                  />
                ) : (
                  <Text className="text-sm text-ink-muted">
                    {session?.displayName
                      ? `Set up ${session.displayName} as the patient for your bookings.`
                      : "Set yourself up as the patient to book appointments."}
                  </Text>
                )}
                <Text className="text-sm text-ink-muted">
                  {!bookingBeneficiary
                    ? "Tap Book for myself to confirm your date of birth and gender, then book as usual."
                    : bookingBeneficiary.relationship === "self"
                      ? "Default: yourself. Change only when booking for someone else."
                      : "Booking for a dependent or proxy. Switch back to yourself anytime."}
                </Text>
                {!selfBeneficiary ? (
                  <Pressable
                    accessibilityLabel="Book for myself"
                    accessibilityRole="button"
                    className="min-h-12 items-center justify-center rounded-xl bg-primary px-4 web:hover:opacity-90"
                    onPress={() => setSetupSelfOpen(true)}
                  >
                    <Text className="text-base font-semibold text-surface">
                      Book for myself
                    </Text>
                  </Pressable>
                ) : null}
                <Pressable
                  accessibilityLabel="Change who this booking is for"
                  accessibilityRole="button"
                  className="min-h-12 justify-center web:hover:opacity-80"
                  onPress={() => setBeneficiarySheetOpen(true)}
                >
                  <Text className="text-base font-semibold text-primary">
                    {!bookingBeneficiary
                      ? "Or choose another patient"
                      : bookingBeneficiary.relationship === "self"
                        ? "Book for someone else"
                        : "Change patient"}
                  </Text>
                </Pressable>
              </Card>

              {upcomingVisit ? (
                <VisitCard
                  address={upcomingVisit.address}
                  beneficiaryName={upcomingVisit.beneficiaryName}
                  dbStatus={upcomingVisit.dbStatus}
                  doctorName={upcomingVisit.doctorName}
                  room={upcomingVisit.room}
                  startsAt={upcomingVisit.startsAt}
                  status="upcoming"
                  telehealthJoinLabel={
                    upcomingVisit.type === "telehealth" &&
                    upcomingVisit.dbStatus === "confirmed"
                      ? (() => {
                          const join = telehealthJoinState(upcomingVisit.startsAt);
                          return join.showJoin ? join.label : undefined;
                        })()
                      : undefined
                  }
                  type={upcomingVisit.type}
                  onJoinTelehealth={() => {
                    const url = upcomingVisit.videoUrl;
                    if (!url) {
                      AccessibilityInfo.announceForAccessibility(
                        "Telehealth link is not ready yet.",
                      );
                      return;
                    }
                    void Linking.openURL(url);
                  }}
                />
              ) : (
                <EmptyState message="No upcoming visits yet." title="Upcoming" />
              )}
            </View>

            <View className={isWide ? "w-80 gap-3" : "gap-3"}>
              <Pressable
                accessibilityLabel="Book Appointment"
                accessibilityRole="button"
                accessibilityState={{ busy: startingBooking }}
                className="min-h-12 items-center justify-center rounded-xl bg-primary px-4 web:hover:opacity-90"
                disabled={startingBooking}
                onPress={() => void handleBookAppointment()}
              >
                <Text className="text-base font-semibold text-surface">
                  Book Appointment
                </Text>
              </Pressable>
              {returningLine &&
              bookingBeneficiary?.relationship === "self" ? (
                <View className="gap-2">
                  <Text className="text-sm text-ink-muted">
                    With {returningLine.doctorName} ·{" "}
                    {returningLine.appointmentType.replace("-", " ")}
                  </Text>
                  <Pressable
                    accessibilityLabel="Change doctor or visit type"
                    accessibilityRole="button"
                    className="min-h-11 justify-center web:hover:opacity-80"
                    onPress={() => {
                      if (!bookingBeneficiary) {
                        return;
                      }
                      beginStandardFlow(bookingBeneficiary.id);
                      router.push("/book/doctor");
                    }}
                  >
                    <Text className="text-sm font-semibold text-primary">
                      Change doctor or visit type
                    </Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
          </View>

          <HospitalFooter />
        </ScrollView>
      )}

      <Sheet
        open={beneficiarySheetOpen}
        onOpenChange={setBeneficiarySheetOpen}
        title="Choose patient"
      >
        <View className="gap-2">
          {selfBeneficiary ? (
            <BeneficiaryPill
              displayName={selfBeneficiary.displayName}
              relationship="self"
              selected={bookingBeneficiary?.id === selfBeneficiary.id}
              onPress={() => {
                resetBookingToSelf();
                setBeneficiarySheetOpen(false);
              }}
            />
          ) : (
            <Pressable
              accessibilityLabel="Book for myself"
              accessibilityRole="button"
              className="min-h-12 items-center justify-center rounded-xl border border-primary px-4 web:hover:opacity-90"
              onPress={() => {
                setBeneficiarySheetOpen(false);
                setSetupSelfOpen(true);
              }}
            >
              <Text className="font-semibold text-primary">Book for myself</Text>
            </Pressable>
          )}
          {beneficiaries
            .filter((beneficiary) => beneficiary.relationship !== "self")
            .map((beneficiary) => (
              <BeneficiaryPill
                key={beneficiary.id}
                displayName={beneficiary.displayName}
                relationship={beneficiary.relationship}
                selected={beneficiary.id === bookingBeneficiary?.id}
                onPress={() => {
                  setPreferredBeneficiaryId(beneficiary.id);
                  setBeneficiarySheetOpen(false);
                }}
              />
            ))}
          <Pressable
            accessibilityLabel="Add new patient"
            accessibilityRole="button"
            className="min-h-12 items-center justify-center rounded-xl border border-primary px-4 web:hover:opacity-90"
            onPress={() => {
              setBeneficiarySheetOpen(false);
              setAddPatientOpen(true);
            }}
          >
            <Text className="font-semibold text-primary">Add new patient</Text>
          </Pressable>
        </View>
      </Sheet>

      <AddBeneficiarySheet
        errorMessage={addPatientError}
        onOpenChange={setAddPatientOpen}
        onSubmit={saveBeneficiary}
        open={addPatientOpen}
        submitting={addPatientSubmitting}
      />

      <SetupSelfBeneficiarySheet
        defaultDisplayName={session?.displayName ?? ""}
        errorMessage={setupSelfError}
        onOpenChange={setSetupSelfOpen}
        onSubmit={saveSelfBeneficiary}
        open={setupSelfOpen}
        submitting={setupSelfSubmitting}
      />
    </View>
  );
}
