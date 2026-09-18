import { useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";

import { Sheet } from "@/components/ui/sheet";
import { FormTextInput } from "@/components/ui/form-text-input";
import {
  validateConfirmVisitFields,
  type ConfirmVisitFormFields,
} from "@/lib/validation/confirm-visit";
import type { AppointmentType } from "@/types/scheduling";

interface ConfirmVisitSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appointmentType: AppointmentType;
  beneficiaryName: string;
  homeVisitAddress?: string;
  submitting: boolean;
  errorMessage: string | null;
  onConfirm: (values: ConfirmVisitFormFields) => Promise<void>;
}

export function ConfirmVisitSheet({
  open,
  onOpenChange,
  appointmentType,
  beneficiaryName,
  homeVisitAddress,
  submitting,
  errorMessage,
  onConfirm,
}: ConfirmVisitSheetProps) {
  const [room, setRoom] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);

  const submit = async () => {
    const values = { room, videoUrl };
    const message = validateConfirmVisitFields(appointmentType, values);
    if (message) {
      setFieldError(message);
      return;
    }
    setFieldError(null);
    await onConfirm(values);
  };

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Confirm visit"
      accessibilityLabel="Confirm appointment details"
    >
      <View className="gap-3">
        <Text className="text-sm text-ink-muted">
          Confirming visit for {beneficiaryName}. The patient will see these
          details in My Visits.
        </Text>

        {appointmentType === "in-clinic" ? (
          <View className="gap-1">
            <Text className="text-sm font-medium text-ink">Room / location</Text>
            <FormTextInput
              accessibilityLabel="Room or clinic location"
              onChangeText={setRoom}
              placeholder="e.g. Outpatients 2B"
              value={room}
            />
          </View>
        ) : null}

        {appointmentType === "telehealth" ? (
          <View className="gap-1">
            <Text className="text-sm font-medium text-ink">Video meeting link</Text>
            <FormTextInput
              accessibilityLabel="Telehealth video link"
              autoCapitalize="none"
              keyboardType="url"
              onChangeText={setVideoUrl}
              placeholder="https://…"
              value={videoUrl}
            />
          </View>
        ) : null}

        {appointmentType === "home-visit" && homeVisitAddress ? (
          <View className="gap-1">
            <Text className="text-sm font-medium text-ink">Visit address</Text>
            <Text className="text-base text-ink" selectable>
              {homeVisitAddress}
            </Text>
          </View>
        ) : null}

        {fieldError ? (
          <Text accessibilityLiveRegion="assertive" className="text-sm text-ink">
            {fieldError}
          </Text>
        ) : null}
        {errorMessage ? (
          <Text accessibilityLiveRegion="assertive" className="text-sm text-ink">
            {errorMessage}
          </Text>
        ) : null}

        <Pressable
          accessibilityLabel="Confirm appointment"
          accessibilityRole="button"
          accessibilityState={{ busy: submitting, disabled: submitting }}
          className="min-h-12 items-center justify-center rounded-xl bg-primary px-4 web:hover:opacity-90"
          disabled={submitting}
          onPress={() => void submit()}
        >
          {submitting ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text className="text-base font-semibold text-surface">Confirm</Text>
          )}
        </Pressable>
      </View>
    </Sheet>
  );
}
