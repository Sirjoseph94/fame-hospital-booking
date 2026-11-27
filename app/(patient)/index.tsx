import { useEffect, useMemo, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { router } from "expo-router";
import * as Linking from "expo-linking";
import { useQueryClient } from "@tanstack/react-query";

import { AddBeneficiarySheet } from "@/components/patient/add-beneficiary-sheet";
import { SetupSelfBeneficiarySheet } from "@/components/patient/setup-self-beneficiary-sheet";
import { HospitalFooter } from "@/components/patient/hospital-footer";
import { RefreshErrorNotice } from "@/components/ui/refresh-error-notice";
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
import { usePatientAppointments } from "@/lib/queries/appointments";
import {
  useBeneficiaries,
  useCreateBeneficiary,
  useEnsureSelfBeneficiary,
} from "@/lib/queries/beneficiaries";
import { useDoctors } from "@/lib/queries/doctors";
import { queryKeys } from "@/lib/query/keys";
import { useRefreshOnFocus } from "@/lib/query/use-refresh-on-focus";
import { useBookingStore } from "@/lib/stores/booking";
import { usePatientBookingPrefs } from "@/lib/stores/patient-booking-prefs";
import { useSessionStore } from "@/lib/stores/session";
import { SchedulingError } from "@/lib/services/scheduling";
import type { AddBeneficiaryFields } from "@/components/patient/add-beneficiary-sheet";
import type { SetupSelfBeneficiaryFields } from "@/components/patient/setup-self-beneficiary-sheet";
import type { Appointment, Beneficiary, Doctor } from "@/types/scheduling";

const EMPTY_BENEFICIARIES: Beneficiary[] = [];
const EMPTY_DOCTORS: Doctor[] = [];

function homeErrorMessage(cause: unknown): string {
  return cause instanceof SchedulingError
    ? cause.message
    : "Could not load your home screen.";
}

export default function PatientHomeScreen() {
  const session = useSessionStore((state) => state.session);
  const userId = session?.userId;
  const breakpoint = useBreakpoint();
  const queryClient = useQueryClient();

  const beneficiariesQuery = useBeneficiaries(userId);
  const doctorsQuery = useDoctors();
  const appointmentsQuery = usePatientAppointments(userId);
  const ensureSelf = useEnsureSelfBeneficiary();
  const createSelfBeneficiary = useCreateBeneficiary();
  const createDependentBeneficiary = useCreateBeneficiary();

  // Silently refresh whenever Home regains focus (e.g. returning from the
  // booking flow), so the upcoming card isn't stale.
  useRefreshOnFocus([
    queryKeys.beneficiaries(userId ?? ""),
    queryKeys.doctors.list,
    queryKeys.appointments.patient(userId ?? ""),
  ]);

  const beneficiaries = beneficiariesQuery.data ?? EMPTY_BENEFICIARIES;
  const doctors = doctorsQuery.data ?? EMPTY_DOCTORS;
  const appointmentRows = appointmentsQuery.data;

  const [beneficiarySheetOpen, setBeneficiarySheetOpen] = useState(false);
  const [addPatientOpen, setAddPatientOpen] = useState(false);
  const [addPatientError, setAddPatientError] = useState<string | null>(null);
  const [setupSelfOpen, setSetupSelfOpen] = useState(false);
  const [setupSelfError, setSetupSelfError] = useState<string | null>(null);
  const preferredBeneficiaryId = usePatientBookingPrefs(
    (state) => state.selectedBeneficiaryId,
  );
  const setPreferredBeneficiaryId = usePatientBookingPrefs(
    (state) => state.setSelectedBeneficiaryId,
  );
  const resetBookingToSelf = usePatientBookingPrefs((state) => state.resetToSelf);

  const [startingBooking, setStartingBooking] = useState(false);
  const startingBookingRef = useRef(false);

  // Re-render every minute so telehealth join windows stay current.
  useNow(60_000);

  const beginReturningFlow = useBookingStore((state) => state.beginReturningFlow);
  const beginStandardFlow = useBookingStore((state) => state.beginStandardFlow);

  // Create the account holder's "self" beneficiary once if it's missing.
  const missingSelf =
    beneficiariesQuery.data !== undefined &&
    !pickSelfBeneficiary(beneficiariesQuery.data);
  const {
    mutate: ensureSelfBeneficiary,
    isIdle: ensureSelfIdle,
    isPending: ensureSelfPending,
  } = ensureSelf;
  useEffect(() => {
    if (userId && missingSelf && ensureSelfIdle) {
      ensureSelfBeneficiary(userId);
    }
  }, [ensureSelfBeneficiary, ensureSelfIdle, missingSelf, userId]);

  const homeQueries = [beneficiariesQuery, doctorsQuery, appointmentsQuery];
  const initialLoading =
    homeQueries.some((query) => query.data === undefined && query.isPending) ||
    (missingSelf && (ensureSelfIdle || ensureSelfPending));
  const blockingError = homeQueries.find(
    (query) => query.isError && query.data === undefined,
  )?.error;
  const refreshError = homeQueries.find((query) => query.isError)?.error;
  const retryLoad = () => {
    void Promise.all(homeQueries.map((query) => query.refetch()));
  };

  const returningLine = useMemo((): {
    doctorName: string;
    appointmentType: Appointment["type"];
  } | null => {
    const self = pickSelfBeneficiary(beneficiaries);
    const lastBooking = lastBookedDoctorId(appointmentRows ?? []);
    const doctorName = lastBooking
      ? doctorNameById(doctors, lastBooking.doctorId)
      : undefined;
    if (
      lastBooking &&
      self &&
      lastBooking.appointmentType !== "home-visit" &&
      doctorName
    ) {
      return { doctorName, appointmentType: lastBooking.appointmentType };
    }
    return null;
  }, [appointmentRows, beneficiaries, doctors]);

  const upcomingVisit = useMemo(() => {
    const next = nextUpcomingAppointment(appointmentRows ?? []);
    if (!next?.startsAt) {
      return null;
    }
    const beneficiary =
      beneficiaries.find((row) => row.id === next.beneficiaryId) ??
      pickSelfBeneficiary(beneficiaries);
    return {
      beneficiaryName: beneficiary?.displayName ?? "Patient",
      doctorName: doctorNameById(doctors, next.doctorId) ?? "Doctor",
      startsAt: next.startsAt,
      endsAt: next.endsAt,
      type: next.type,
      dbStatus: next.dbStatus,
      videoUrl: next.videoUrl,
      room: next.room,
      address: next.address,
    };
  }, [appointmentRows, beneficiaries, doctors]);

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

  /**
   * The mutation already refetched the list; also make sure the new row is
   * cached even if that refetch failed, so selecting it doesn't get reset.
   */
  const cacheCreatedBeneficiary = (accountHolderId: string, created: Beneficiary) => {
    queryClient.setQueryData<Beneficiary[]>(
      queryKeys.beneficiaries(accountHolderId),
      (rows) =>
        rows && !rows.some((row) => row.id === created.id)
          ? [...rows, created]
          : rows,
    );
  };

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
    let appointments: Appointment[];
    try {
      // Use fresh history to decide between the returning and standard flows.
      const result = await appointmentsQuery.refetch();
      // Fall back to the standard flow if history can't be loaded.
      appointments = result.isError ? [] : (result.data ?? []);
    } catch {
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

  /** Resolves false on failure so the sheet keeps the draft. */
  const saveSelfBeneficiary = async (
    values: SetupSelfBeneficiaryFields,
  ): Promise<boolean> => {
    if (!session) {
      return false;
    }
    setSetupSelfError(null);
    try {
      const created = await createSelfBeneficiary.mutateAsync({
        accountHolderId: session.userId,
        displayName: values.displayName,
        relationship: "self",
        dob: values.dob,
        gender: values.gender,
      });
      cacheCreatedBeneficiary(session.userId, created);
      resetBookingToSelf();
      setSetupSelfOpen(false);
      AccessibilityInfo.announceForAccessibility(
        "You are set up to book for yourself.",
      );
      return true;
    } catch (cause) {
      setSetupSelfError(
        cause instanceof Error
          ? cause.message
          : "Could not save your patient profile.",
      );
      return false;
    }
  };

  /** Resolves false on failure so the sheet keeps the draft. */
  const saveBeneficiary = async (
    values: AddBeneficiaryFields,
  ): Promise<boolean> => {
    if (!session) {
      return false;
    }
    setAddPatientError(null);
    try {
      const created = await createDependentBeneficiary.mutateAsync({
        accountHolderId: session.userId,
        displayName: values.displayName,
        relationship: values.relationship,
        dob: values.dob,
        gender: values.gender,
        nationalId: values.nationalId,
        hospitalFileId: values.hospitalFileId,
      });
      cacheCreatedBeneficiary(session.userId, created);
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
      return true;
    } catch (cause) {
      setAddPatientError(
        cause instanceof Error ? cause.message : "Could not save patient.",
      );
      return false;
    }
  };

  const isWide = breakpoint !== "phone";

  return (
    <View className="flex-1 bg-surface-muted">
      <ShellHeader title="Home" />
      {initialLoading ? (
        <ScreenLoadingSkeleton>
          <HomeScreenSkeleton />
        </ScreenLoadingSkeleton>
      ) : blockingError ? (
        <View className="flex-1 justify-center px-4">
          <SchedulingStatePanel
            message={homeErrorMessage(blockingError)}
            onRetry={retryLoad}
          />
        </View>
      ) : (
        <ScrollView
          contentContainerClassName="gap-4 px-4 pb-8 pt-2"
          contentInsetAdjustmentBehavior="automatic"
        >
          <RefreshErrorNotice
            message={refreshError ? homeErrorMessage(refreshError) : null}
          />
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
                    upcomingVisit.dbStatus === "confirmed" &&
                    upcomingVisit.videoUrl
                      ? (() => {
                          const join = telehealthJoinState(
                            upcomingVisit.startsAt,
                            upcomingVisit.endsAt,
                          );
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
        submitting={createDependentBeneficiary.isPending}
      />

      <SetupSelfBeneficiarySheet
        defaultDisplayName={session?.displayName ?? ""}
        errorMessage={setupSelfError}
        onOpenChange={setSetupSelfOpen}
        onSubmit={saveSelfBeneficiary}
        open={setupSelfOpen}
        submitting={createSelfBeneficiary.isPending}
      />
    </View>
  );
}
