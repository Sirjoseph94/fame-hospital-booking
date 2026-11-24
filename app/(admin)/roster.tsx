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
import { InviteError, type DoctorInvite } from "@/lib/services/invites";
import { bufferMinutesSchema } from "@/lib/validation/forms";
import { doctorInviteFormSchema } from "@/lib/validation/invites";
import { EmptyState } from "@/components/ui/empty-state";
import { SchedulingStatePanel } from "@/components/ui/scheduling-state-panel";
import {
  HomeScreenSkeleton,
  ScreenLoadingSkeleton,
  VisitListSkeleton,
} from "@/components/ui/skeleton";
import { RefreshErrorNotice } from "@/components/ui/refresh-error-notice";
import { useDoctorRoster, useSetAccountActive } from "@/lib/queries/doctors";
import {
  useCreateDoctorInvite,
  useDoctorInvites,
  useRevokeDoctorInvite,
} from "@/lib/queries/invites";
import {
  useSchedulingSettings,
  useUpdateBufferMinutes,
} from "@/lib/queries/settings";
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
  const settingsQuery = useSchedulingSettings();
  const invitesQuery = useDoctorInvites();
  useRefreshOnFocus([
    queryKeys.doctors.roster,
    queryKeys.settings,
    queryKeys.invites,
  ]);

  const setAccountActive = useSetAccountActive();
  const updateBufferMinutes = useUpdateBufferMinutes();
  const createDoctorInvite = useCreateDoctorInvite();
  const revokeDoctorInvite = useRevokeDoctorInvite();

  const [userRefreshing, setUserRefreshing] = useState(false);
  const [toggleError, setToggleError] = useState<string | null>(null);
  // What the admin has typed; null shows the saved value.
  const [bufferDraft, setBufferDraft] = useState<string | null>(null);
  const [bufferMessage, setBufferMessage] = useState<string | null>(null);
  const [bufferError, setBufferError] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteSpecialty, setInviteSpecialty] = useState("");
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
  const invites = invitesQuery.data ?? [];
  const bufferMinutes =
    bufferDraft ?? String(settingsQuery.data?.bufferMinutes ?? 15);
  const savingBuffer = updateBufferMinutes.isPending;
  const creatingInvite = createDoctorInvite.isPending;
  const revokingInviteId = revokeDoctorInvite.isPending
    ? revokeDoctorInvite.variables
    : null;
  const togglingDoctorId = setAccountActive.isPending
    ? setAccountActive.variables.userId
    : null;

  const queries = [rosterQuery, settingsQuery, invitesQuery];
  const isPending = queries.some((query) => query.isPending);
  // Nothing to show yet: a failed first load replaces the screen.
  const blockingError = queries.find((query) => query.isError && !query.data)?.error;
  // A failed refresh keeps the data already shown.
  const refreshError = queries.find((query) => query.isError && query.data)?.error;

  const refresh = async () => {
    setUserRefreshing(true);
    // Pull-to-refresh shows the saved buffer again, as before.
    setBufferDraft(null);
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

  const saveBuffer = async () => {
    const parsedNumber = Number.parseInt(bufferMinutes, 10);
    const validated = bufferMinutesSchema.safeParse(parsedNumber);
    if (!validated.success) {
      setBufferError(
        validated.error.issues[0]?.message ??
          "Enter a whole number of minutes (0 or more).",
      );
      return;
    }
    const parsed = validated.data;

    setBufferError(null);
    setBufferMessage(null);
    try {
      await updateBufferMinutes.mutateAsync(parsed);
      // The cache now holds the saved value; show it.
      setBufferDraft(null);
      setBufferMessage("Buffer updated for all doctors.");
    } catch (cause) {
      setBufferError(
        cause instanceof SchedulingError
          ? cause.message
          : "Could not update buffer.",
      );
    }
  };

  const createInvite = async () => {
    const parsed = doctorInviteFormSchema.safeParse({
      email: inviteEmail,
      specialty: inviteSpecialty,
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
        bio: parsed.data.bio,
        consultationFee: fee,
        yearsExperience: years,
        expiresAt: addDays(new Date(), expiryDays).toISOString(),
      });
      setInviteEmail("");
      setInviteSpecialty("");
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
            <Text className="text-base font-semibold text-ink">
              Post-visit buffer
            </Text>
            <Text className="text-sm text-ink-muted">
              Minutes blocked after each booked visit before the next slot can be
              booked. Doctors see this on their agenda; patients see it on the slot
              grid.
            </Text>
            <Text className="text-sm font-medium text-ink">Buffer (minutes)</Text>
            <FormTextInput
              accessibilityLabel="Buffer minutes"
              kind="number"
              onChangeText={setBufferDraft}
              value={bufferMinutes}
            />
            <FieldError message={bufferError ?? undefined} />
            {bufferMessage ? (
              <Text accessibilityLiveRegion="polite" className="text-sm text-available">
                {bufferMessage}
              </Text>
            ) : null}
            <Pressable
              accessibilityLabel="Save buffer minutes"
              accessibilityRole="button"
              accessibilityState={{ disabled: savingBuffer }}
              className="min-h-12 items-center justify-center rounded-xl bg-primary web:hover:opacity-90"
              disabled={savingBuffer}
              onPress={() => void saveBuffer()}
            >
              {savingBuffer ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text className="font-semibold text-surface">Save buffer</Text>
              )}
            </Pressable>
          </Card>

          <Card style={{ gap: 12 }}>
            <Text className="text-base font-semibold text-ink">Invite doctor</Text>
            <Text className="text-sm text-ink-muted">
              Create an invite code for a new clinician. Email is for your records
              only in this pilot—we do not send email or require the account email
              to match.
            </Text>
            <View className="gap-1">
              <Text className="text-sm font-medium text-ink">Email (reference)</Text>
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
                      Next open slot:{" "}
                      {doctor.nextAvailable
                        ? format(parseISO(doctor.nextAvailable), "MMM d · h:mm a")
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
                      accessibilityLabel={`Manage schedule for ${doctor.name}`}
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
                        Schedule
                      </Text>
                    </Pressable>
                    <Pressable
                      accessibilityLabel={`Set blackout for ${doctor.name}`}
                      accessibilityRole="button"
                      className="min-h-11 flex-1 items-center justify-center rounded-xl border border-ink-muted px-3 web:hover:opacity-90"
                      onPress={() =>
                        router.push({
                          pathname: "/doctor/[id]/blackout",
                          params: { id: doctor.id },
                        })
                      }
                    >
                      <Text className="text-sm font-semibold text-ink-muted">
                        Blackout
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
