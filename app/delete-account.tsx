import { useState, type ReactNode } from "react";
import {
  AccessibilityInfo,
  ActivityIndicator,
  Pressable,
  Text,
  View,
} from "react-native";
import { Link, router, Stack } from "expo-router";

import { PageScrollView } from "@/components/ui/page-scroll-view";
import { goBack } from "@/components/legal/legal-page";
import { Card } from "@/components/ui/card";
import { FormTextInput } from "@/components/ui/form-text-input";
import { contactSentence, DEFAULT_HOSPITAL_INFO } from "@/lib/hospital-info";
import { useHospitalInfo } from "@/lib/queries/hospital-info";
import { AccountError, accountsService } from "@/lib/services/accounts";
import { useBookingStore } from "@/lib/stores/booking";
import { usePatientBookingPrefs } from "@/lib/stores/patient-booking-prefs";
import { useSessionStore } from "@/lib/stores/session";

const CONFIRM_WORD = "DELETE";

const deletedData = [
  "Your sign-in (email and password)",
  "Your profile: name, date of birth, gender, phone, address and emergency contact",
  "Health details you added: blood type, allergies, medications, conditions and notes",
  "Family members you added",
  "Your appointment history, past and upcoming, and any waitlist places",
  "Notification settings, device tokens and the record of notifications sent to you",
];

function Bullets({ items }: { items: readonly string[] }) {
  return (
    <View className="gap-2">
      {items.map((item) => (
        <View key={item} className="flex-row gap-3 pl-1">
          <Text aria-hidden className="text-base leading-7 text-ink-muted">
            •
          </Text>
          <Text className="flex-1 text-base leading-7 text-ink">{item}</Text>
        </View>
      ))}
    </View>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View className="gap-3">
      <Text accessibilityRole="header" className="text-xl font-semibold text-ink">
        {title}
      </Text>
      {children}
    </View>
  );
}

/**
 * Public page (also the web URL given to Google Play): explains what deletion
 * removes, and lets a signed-in patient delete their account.
 */
export default function DeleteAccountScreen() {
  const authReady = useSessionStore((state) => state.authReady);
  const hasHydrated = useSessionStore((state) => state.hasHydrated);
  const session = useSessionStore((state) => state.session);
  const { data: hospitalInfo = DEFAULT_HOSPITAL_INFO } = useHospitalInfo();
  const contact = contactSentence(hospitalInfo);
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleted, setDeleted] = useState<{ cancelledVisits: number } | null>(
    null,
  );

  const confirmed = confirmText.trim().toUpperCase() === CONFIRM_WORD;

  const deleteAccount = async () => {
    if (!confirmed || busy) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await accountsService.deleteMyAccount();
      useBookingStore.getState().resetBookingDraft();
      usePatientBookingPrefs.getState().resetToSelf();
      setDeleted(result);
      AccessibilityInfo.announceForAccessibility("Your account has been deleted.");
    } catch (cause) {
      const message =
        cause instanceof AccountError
          ? cause.message
          : "Your account could not be deleted. Try again.";
      setError(message);
      AccessibilityInfo.announceForAccessibility(message);
    } finally {
      setBusy(false);
    }
  };

  const renderAction = () => {
    if (deleted) {
      return (
        <Card style={{ gap: 12 }}>
          <Text accessibilityRole="header" className="text-lg font-semibold text-ink">
            Your account has been deleted
          </Text>
          <Text className="text-base leading-6 text-ink-muted">
            {deleted.cancelledVisits > 0
              ? `We cancelled ${deleted.cancelledVisits} upcoming ${deleted.cancelledVisits === 1 ? "visit" : "visits"} and let the ${deleted.cancelledVisits === 1 ? "doctor" : "doctors"} know. `
              : ""}
            Thank you for using {hospitalInfo.name} Booking.
          </Text>
          <Pressable
            accessibilityRole="link"
            className="min-h-12 items-center justify-center rounded-xl bg-primary px-5 web:hover:opacity-90"
            onPress={() => router.replace("/sign-in")}
          >
            <Text className="text-base font-semibold text-surface">Done</Text>
          </Pressable>
        </Card>
      );
    }

    if (!authReady || !hasHydrated) {
      return (
        <Card>
          <Text accessibilityLiveRegion="polite" className="text-base text-ink-muted">
            Checking your sign-in…
          </Text>
        </Card>
      );
    }

    if (!session) {
      return (
        <Card style={{ gap: 12 }}>
          <Text className="text-lg font-semibold text-ink">How to delete your account</Text>
          <Text className="text-base leading-7 text-ink">
            1. Sign in to the app or website.{"\n"}
            2. Open the Profile tab.{"\n"}
            3. Tap Delete account and confirm.
          </Text>
          <Link href="/sign-in" asChild>
            <Pressable
              accessibilityRole="link"
              className="min-h-12 items-center justify-center rounded-xl bg-primary px-5 web:hover:opacity-90"
            >
              <Text className="text-base font-semibold text-surface">Sign in</Text>
            </Pressable>
          </Link>
          <Text className="text-sm leading-5 text-ink-muted">
            {hospitalInfo.email
              ? `Can't sign in? Email ${hospitalInfo.email} from the address on your account and we'll delete it for you.`
              : `Can't sign in? To have your account deleted, ${contact}.`}
          </Text>
        </Card>
      );
    }

    if (session.role !== "patient") {
      return (
        <Card style={{ gap: 8 }}>
          <Text className="text-lg font-semibold text-ink">Staff account</Text>
          <Text className="text-base leading-6 text-ink">
            Doctor and administrator accounts are managed by the hospital, because
            they are linked to other patients&apos; appointments. Ask an
            administrator to remove your account, or {contact}.
          </Text>
        </Card>
      );
    }

    return (
      <Card style={{ gap: 12 }}>
        <Text className="text-lg font-semibold text-ink">Delete my account</Text>
        <Text className="text-base leading-6 text-ink">
          Signed in as {session.displayName}. This can&apos;t be undone.
        </Text>
        <View className="gap-1">
          <Text className="text-sm font-medium text-ink">
            Type {CONFIRM_WORD} to confirm
          </Text>
          <FormTextInput
            accessibilityLabel={`Type ${CONFIRM_WORD} to confirm account deletion`}
            autoCapitalize="characters"
            autoComplete="off"
            autoCorrect={false}
            editable={!busy}
            onChangeText={setConfirmText}
            value={confirmText}
          />
        </View>
        {error ? (
          <Text accessibilityLiveRegion="assertive" className="text-sm text-danger">
            {error}
          </Text>
        ) : null}
        <Pressable
          accessibilityLabel="Permanently delete my account"
          accessibilityRole="button"
          accessibilityState={{ busy, disabled: !confirmed || busy }}
          className={`min-h-12 items-center justify-center rounded-xl px-5 ${
            confirmed ? "bg-danger web:hover:opacity-90" : "bg-ink-muted opacity-60"
          }`}
          disabled={!confirmed || busy}
          onPress={() => void deleteAccount()}
        >
          {busy ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text className="text-base font-semibold text-surface">
              Permanently delete my account
            </Text>
          )}
        </Pressable>
      </Card>
    );
  };

  return (
    <>
      <Stack.Screen options={{ title: "Delete account · FAME Hospital Booking" }} />
      <PageScrollView
        className="flex-1 bg-surface-muted"
        contentContainerClassName="items-center px-4 py-10"
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
      >
        <View className="w-full max-w-2xl gap-8">
          <Pressable
            accessibilityLabel="Go back"
            accessibilityRole="link"
            className="min-h-12 self-start justify-center web:hover:opacity-80"
            onPress={goBack}
          >
            <Text className="text-base font-semibold text-primary">← Back</Text>
          </Pressable>

          <View className="gap-2">
            <Text accessibilityRole="header" className="text-3xl font-bold text-ink">
              Delete your account
            </Text>
            <Text className="text-base leading-7 text-ink-muted">
              You can delete your {hospitalInfo.name} Booking account and its data
              at any time, from the app or this page.
            </Text>
          </View>

          {renderAction()}

          <Section title="What is deleted">
            <Text className="text-base leading-7 text-ink">
              Deletion is immediate and permanent. We remove:
            </Text>
            <Bullets items={deletedData} />
          </Section>

          <Section title="Upcoming visits">
            <Text className="text-base leading-7 text-ink">
              Any upcoming visits are cancelled first, so your places can be
              offered to other patients.
            </Text>
          </Section>

          <Section title="What is not affected">
            <Text className="text-base leading-7 text-ink">
              This deletes your data from the booking app. It doesn&apos;t change
              medical records the hospital keeps in its own systems; to ask about
              those, {contact}.
            </Text>
          </Section>

          <Link
            accessibilityRole="link"
            className="min-h-12 py-3 text-base font-semibold text-primary web:hover:opacity-80"
            href="/privacy"
          >
            Read our Privacy Policy
          </Link>
        </View>
      </PageScrollView>
    </>
  );
}
