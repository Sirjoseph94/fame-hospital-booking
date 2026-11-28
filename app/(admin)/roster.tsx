import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { addDays, format, parseISO } from "date-fns";
import { router } from "expo-router";
import { ShellHeader } from "@/components/shell-header";
import { Card } from "@/components/ui/card";
import { FieldError } from "@/components/ui/field-error";
import { FormTextInput } from "@/components/ui/form-text-input";
import { confirmAsync } from "@/lib/confirm";
import { copyText } from "@/lib/copy-text";
import {
  effectiveInviteStatus,
  InviteError,
  type DoctorInvite,
} from "@/lib/services/invites";
import { doctorInviteFormSchema } from "@/lib/validation/invites";
import { EmptyState } from "@/components/ui/empty-state";
import { SchedulingStatePanel } from "@/components/ui/scheduling-state-panel";
import {
  HomeScreenSkeleton,
  ScreenLoadingSkeleton,
  VisitListSkeleton,
} from "@/components/ui/skeleton";
import { RefreshErrorNotice } from "@/components/ui/refresh-error-notice";
import { formatSessionWhen, placesLeftLabel } from "@/lib/session-groups";
import { useDoctorRoster, useSetAccountActive } from "@/lib/queries/doctors";
import {
  useCreateDoctorInvite,
  useDoctorInvites,
  useRevokeDoctorInvite,
} from "@/lib/queries/invites";
import { queryKeys } from "@/lib/query/keys";
import { useRefreshOnFocus } from "@/lib/query/use-refresh-on-focus";
import { AccountError } from "@/lib/services/accounts";
import { SchedulingError } from "@/lib/services/scheduling";
import type { RosterDoctor } from "@/types/scheduling";

function loadErrorMessage(cause: unknown): string {
  return cause instanceof SchedulingError
    ? cause.message
    : "Could not load the doctor roster.";
}

export default function AdminRosterScreen() {
  const rosterQuery = useDoctorRoster();
  const invitesQuery = useDoctorInvites();
  useRefreshOnFocus([
    queryKeys.doctors.roster,
    queryKeys.invites,
  ]);

  const setAccountActive = useSetAccountActive();
  const createDoctorInvite = useCreateDoctorInvite();
  const revokeDoctorInvite = useRevokeDoctorInvite();

  const [userRefreshing, setUserRefreshing] = useState(false);
  const [toggleError, setToggleError] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteSpecialty, setInviteSpecialty] = useState("");
  const [inviteDepartment, setInviteDepartment] = useState("");
  const [inviteBio, setInviteBio] = useState("");
  const [inviteFee, setInviteFee] = useState("");
  const [inviteYears, setInviteYears] = useState("");
  const [inviteExpiryDays, setInviteExpiryDays] = useState("7");
  const [inviteFormError, setInviteFormError] = useState<string | null>(null);
  const [inviteMessage, setInviteMessage] = useState<string | null>(null);
  const [copiedInviteId, setCopiedInviteId] = useState<string | null>(null);
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (copiedTimerRef.current) {
        clearTimeout(copiedTimerRef.current);
      }
    },
    [],
  );

  const doctors = rosterQuery.data ?? [];
  const allInvites = invitesQuery.data ?? [];
  const invites = allInvites.filter((invite) => effectiveInviteStatus(invite) === "pending");
  const inviteHistory = allInvites.filter((invite) => effectiveInviteStatus(invite) !== "pending");
  const [showInviteHistory, setShowInviteHistory] = useState(false);
  const creatingInvite = createDoctorInvite.isPending;
  const revokingInviteId = revokeDoctorInvite.isPending
    ? revokeDoctorInvite.variables
    : null;
  const togglingDoctorId = setAccountActive.isPending
    ? setAccountActive.variables.userId
    : null;

  const queries = [rosterQuery, invitesQuery];
  const isPending = queries.some((query) => query.isPending);
  // Nothing to show yet: a failed first load replaces the screen.
  const blockingError = queries.find((query) => query.isError && !query.data)?.error;
  // A failed refresh keeps the data already shown.
  const refreshError = queries.find((query) => query.isError && query.data)?.error;

  const refresh = async () => {
    setUserRefreshing(true);
    try {
      await Promise.all(queries.map((query) => query.refetch()));
    } finally {
      setUserRefreshing(false);
    }
  };

  const retry = () => {
    for (const query of queries) {
      if (query.isError) {
        void query.refetch();
      }
    }
  };

  const createInvite = async () => {
    const parsed = doctorInviteFormSchema.safeParse({
      email: inviteEmail,
      specialty: inviteSpecialty,
      department: inviteDepartment || undefined,
      bio: inviteBio || undefined,
      consultationFee: inviteFee || undefined,
      yearsExperience: inviteYears || undefined,
      expiryDays: inviteExpiryDays,
    });
    if (!parsed.success) {
      setInviteFormError(
        parsed.error.issues[0]?.message ?? "Check the invite fields.",
      );
      return;
    }

    setInviteFormError(null);
    setInviteMessage(null);
    try {
      const fee = parsed.data.consultationFee
        ? Number.parseFloat(parsed.data.consultationFee)
        : 0;
      const years = parsed.data.yearsExperience
        ? Number.parseInt(parsed.data.yearsExperience, 10)
        : 0;
      const expiryDays = Number.parseInt(parsed.data.expiryDays, 10);
      const invite = await createDoctorInvite.mutateAsync({
        email: parsed.data.email,
        specialty: parsed.data.specialty,
        department: parsed.data.department,
        bio: parsed.data.bio,
        consultationFee: fee,
        yearsExperience: years,
        expiresAt: addDays(new Date(), expiryDays).toISOString(),
      });
      setInviteEmail("");
      setInviteSpecialty("");
      setInviteDepartment("");
      setInviteBio("");
      setInviteFee("");
      setInviteYears("");
      setInviteExpiryDays("7");
      setInviteMessage(
        `Invite created. Share code ${invite.code} with the clinician.`,
      );
    } catch (cause) {
      setInviteFormError(
        cause instanceof InviteError
          ? cause.message
          : "Could not create invite.",
      );
    }
  };

  const revokeInvite = async (invite: DoctorInvite) => {
    const confirmed = await confirmAsync({
      title: "Revoke invite?",
      message: `The invite code for ${invite.email} will stop working immediately.`,
      confirmText: "Revoke",
      destructive: true,
    });
    if (!confirmed) {
      return;
    }
    setInviteFormError(null);
    try {
      await revokeDoctorInvite.mutateAsync(invite.id);
    } catch (cause) {
      setInviteFormError(
        cause instanceof InviteError
          ? cause.message
          : "Could not revoke invite.",
      );
    }
  };

  const toggleDoctorActive = async (doctor: RosterDoctor) => {
    const nextActive = !doctor.accountActive;
    if (!nextActive) {
      const confirmed = await confirmAsync({
        title: `Deactivate ${doctor.name}?`,
        message: "They will no longer be able to sign in or receive bookings.",
        confirmText: "Deactivate",
        destructive: true,
      });
      if (!confirmed) {
        return;
      }
    }
    setToggleError(null);
    try {
      await setAccountActive.mutateAsync({
        userId: doctor.id,
        isActive: nextActive,
      });
    } catch (cause) {
      setToggleError(
        cause instanceof AccountError
          ? cause.message
          : "Could not update account status.",
      );
    }
  };

  const copyInviteCode = async (invite: DoctorInvite) => {
    const copied = await copyText(invite.code);
    if (copied) {
      setCopiedInviteId(invite.id);
      if (copiedTimerRef.current) {
        clearTimeout(copiedTimerRef.current);
      }
      copiedTimerRef.current = setTimeout(() => setCopiedInviteId(null), 2000);
    }
  };

  return (
    <View className="flex-1 bg-surface-muted">
      <ShellHeader title="Doctor roster" />

      {isPending ? (
        <ScreenLoadingSkeleton>
          <HomeScreenSkeleton />
          <VisitListSkeleton count={3} />
        </ScreenLoadingSkeleton>
      ) : blockingError ? (
        <View className="flex-1 justify-center px-4">
          <SchedulingStatePanel
            message={loadErrorMessage(blockingError)}
            onRetry={retry}
          />
        </View>
      ) : (
        <ScrollView
          contentContainerClassName="gap-4 px-4 pb-8 pt-2"
          contentInsetAdjustmentBehavior="automatic"
          refreshControl={
            <RefreshControl
              refreshing={userRefreshing}
              onRefresh={() => void refresh()}
            />
          }
        >
          <RefreshErrorNotice
            message={refreshError ? loadErrorMessage(refreshError) : null}
          />

          <Card style={{ gap: 12 }}>
            <Text className="text-base font-semibold text-ink">Invite doctor</Text>
            <Text className="text-sm text-ink-muted">
              Create an invite code for a new clinician. The code only works for an
              account signed in with this email address. We don&apos;t email it; share
              the code yourself.
            </Text>
            <View className="gap-1">
              <Text className="text-sm font-medium text-ink">Doctor&apos;s email</Text>
              <FormTextInput
                accessibilityLabel="Doctor email for reference"
                kind="email"
                onChangeText={setInviteEmail}
                value={inviteEmail}
              />
            </View>
            <View className="gap-1">
              <Text className="text-sm font-medium text-ink">Specialty</Text>
              <FormTextInput
                accessibilityLabel="Doctor specialty"
                onChangeText={setInviteSpecialty}
                value={inviteSpecialty}
              />
            </View>
            <View className="gap-1">
              <Text className="text-sm font-medium text-ink">Department (optional)</Text>
              <FormTextInput
                accessibilityLabel="Doctor department"
                onChangeText={setInviteDepartment}
                placeholder="Outpatients"
                value={inviteDepartment}
              />
            </View>
            <View className="gap-1">
              <Text className="text-sm font-medium text-ink">Bio (optional)</Text>
              <FormTextInput
                accessibilityLabel="Doctor bio"
                kind="multiline"
                onChangeText={setInviteBio}
                value={inviteBio}
              />
            </View>
            <View className="flex-row gap-3">
              <View className="min-w-0 flex-1 gap-1">
                <Text className="text-sm font-medium text-ink">Fee (optional)</Text>
                <FormTextInput
                  accessibilityLabel="Consultation fee"
                  kind="number"
                  onChangeText={setInviteFee}
                  value={inviteFee}
                />
              </View>
              <View className="min-w-0 flex-1 gap-1">
                <Text className="text-sm font-medium text-ink">Years (optional)</Text>
                <FormTextInput
                  accessibilityLabel="Years of experience"
                  kind="number"
                  onChangeText={setInviteYears}
                  value={inviteYears}
                />
              </View>
            </View>
            <View className="gap-1">
              <Text className="text-sm font-medium text-ink">Expires in (days)</Text>
              <FormTextInput
                accessibilityLabel="Invite expiry days"
                kind="number"
                onChangeText={setInviteExpiryDays}
                value={inviteExpiryDays}
              />
            </View>
            <FieldError message={inviteFormError ?? undefined} />
            {inviteMessage ? (
              <Text accessibilityLiveRegion="polite" className="text-sm text-available">
                {inviteMessage}
              </Text>
            ) : null}
            <Pressable
              accessibilityLabel="Create doctor invite"
              accessibilityRole="button"
              accessibilityState={{ disabled: creatingInvite }}
              className="min-h-12 items-center justify-center rounded-xl bg-primary web:hover:opacity-90"
              disabled={creatingInvite}
              onPress={() => void createInvite()}
            >
              {creatingInvite ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text className="font-semibold text-surface">Create invite</Text>
              )}
            </Pressable>
          </Card>

          <View className="gap-3">
            <Text className="text-base font-semibold text-ink">Pending invites</Text>
            {invites.length === 0 ? (
              <EmptyState message="No pending invites." />
            ) : (
              invites.map((invite) => (
                <Card key={invite.id} style={{ gap: 10 }}>
                  <View className="gap-1">
                    <Text className="text-base font-semibold text-ink" selectable>
                      {invite.specialty}
                    </Text>
                    <Text className="text-sm text-ink-muted">{invite.email}</Text>
                    <Text className="text-xs text-ink-muted">
                      Expires{" "}
                      {format(parseISO(invite.expiresAt), "MMM d, yyyy · h:mm a")}
                    </Text>
                    <Text className="font-mono text-lg font-semibold tracking-widest text-ink" selectable>
                      {invite.code}
                    </Text>
                  </View>
                  <View className="flex-row flex-wrap gap-2">
                    <Pressable
                      accessibilityLabel={`Copy invite code ${invite.code}`}
                      accessibilityRole="button"
                      className="min-h-11 flex-1 items-center justify-center rounded-xl border border-primary px-3 web:hover:opacity-90"
                      onPress={() => void copyInviteCode(invite)}
                    >
                      <Text className="text-sm font-semibold text-primary">
                        {copiedInviteId === invite.id ? "Copied" : "Copy code"}
                      </Text>
                    </Pressable>
                    <Pressable
                      accessibilityLabel={`Revoke invite for ${invite.email}`}
                      accessibilityRole="button"
                      accessibilityState={{
                        disabled: revokeDoctorInvite.isPending,
                      }}
                      className="min-h-11 flex-1 items-center justify-center rounded-xl border border-ink-muted px-3 web:hover:opacity-90"
                      disabled={revokeDoctorInvite.isPending}
                      onPress={() => void revokeInvite(invite)}
                    >
                      {revokingInviteId === invite.id ? (
                        <ActivityIndicator />
                      ) : (
                        <Text className="text-sm font-semibold text-ink-muted">
                          Revoke
                        </Text>
                      )}
                    </Pressable>
                  </View>
                </Card>
              ))
            )}
            {inviteHistory.length > 0 ? (
              <Pressable
                accessibilityLabel={showInviteHistory ? "Hide invite history" : "Show invite history"}
                accessibilityRole="button"
                accessibilityState={{ expanded: showInviteHistory }}
                className="min-h-11 justify-center web:hover:opacity-80"
                onPress={() => setShowInviteHistory((value) => !value)}
              >
                <Text className="text-sm font-semibold text-primary">
                  {showInviteHistory ? "Hide" : "Show"} invite history ({inviteHistory.length})
                </Text>
              </Pressable>
            ) : null}
            {showInviteHistory
              ? inviteHistory.map((invite) => {
                  const status = effectiveInviteStatus(invite);
                  return (
                    <Card key={invite.id} style={{ gap: 4 }}>
                      <View className="flex-row items-start justify-between gap-3">
                        <View className="min-w-0 flex-1 gap-1">
                          <Text className="text-sm font-semibold text-ink" selectable>
                            {invite.email}
                          </Text>
                          <Text className="text-xs text-ink-muted">
                            {invite.specialty}
                            {invite.department ? ` · ${invite.department}` : ""} · created{" "}
                            {format(parseISO(invite.createdAt), "MMM d, yyyy")}
                          </Text>
                        </View>
                        <View className="rounded-full bg-surface-muted px-3 py-1">
                          <Text className="text-xs font-semibold uppercase text-ink-muted">
                            {status}
                          </Text>
                        </View>
                      </View>
                    </Card>
                  );
                })
              : null}
          </View>

          <View className="gap-3">
            <Text className="text-base font-semibold text-ink">Doctors</Text>
            <FieldError message={toggleError ?? undefined} />
            {doctors.length === 0 ? (
              <EmptyState message="No doctors on the roster yet." />
            ) : (
              doctors.map((doctor) => (
                <Card key={doctor.id} style={{ gap: 10 }}>
                  <View className="gap-1">
                    <Text className="text-base font-semibold text-ink" selectable>
                      {doctor.name}
                    </Text>
                    <Text className="text-sm text-ink-muted">
                      {doctor.specialty}
                      {doctor.department ? ` · ${doctor.department}` : ""}
                    </Text>
                    <Text className="text-xs text-ink-muted">
                      {doctor.accountActive
                        ? doctor.isAcceptingBookings
                          ? "Active · accepting bookings"
                          : "Active · not accepting bookings"
                        : "Inactive · cannot sign in or receive bookings"}
                    </Text>
                    <Text className="text-xs text-ink-muted" selectable>
                      Next open session:{" "}
                      {doctor.nextSession
                        ? `${formatSessionWhen(doctor.nextSession)} · ${placesLeftLabel(doctor.nextSession.placesLeft)}`
                        : "none"}
                    </Text>
                  </View>
                  <View className="flex-row flex-wrap gap-2">
                    <Pressable
                      accessibilityLabel={
                        doctor.accountActive
                          ? `Deactivate ${doctor.name}`
                          : `Reactivate ${doctor.name}`
                      }
                      accessibilityRole="button"
                      accessibilityState={{
                        disabled: setAccountActive.isPending,
                      }}
                      className="min-h-11 flex-1 items-center justify-center rounded-xl border border-ink-muted px-3 web:hover:opacity-90"
                      disabled={setAccountActive.isPending}
                      onPress={() => void toggleDoctorActive(doctor)}
                    >
                      {togglingDoctorId === doctor.id ? (
                        <ActivityIndicator />
                      ) : (
                        <Text className="text-sm font-semibold text-ink-muted">
                          {doctor.accountActive ? "Deactivate" : "Reactivate"}
                        </Text>
                      )}
                    </Pressable>
                    <Pressable
                      accessibilityLabel={`Details and schedule for ${doctor.name}`}
                      accessibilityRole="button"
                      className="min-h-11 flex-1 items-center justify-center rounded-xl border border-primary px-3 web:hover:opacity-90"
                      onPress={() =>
                        router.push({
                          pathname: "/doctor/[id]/schedule",
                          params: { id: doctor.id },
                        })
                      }
                    >
                      <Text className="text-sm font-semibold text-primary">
                        Details & schedule
                      </Text>
                    </Pressable>
                  </View>
                </Card>
              ))
            )}
          </View>
        </ScrollView>
      )}
    </View>
  );
}
