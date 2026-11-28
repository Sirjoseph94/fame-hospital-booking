import { useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";

import { Card } from "@/components/ui/card";
import { FormTextInput } from "@/components/ui/form-text-input";
import { useUpdateDoctorDetails } from "@/lib/queries/doctors";
import { SchedulingError } from "@/lib/services/scheduling";
import { colors } from "@/lib/theme-colors";
import type { DoctorDetail } from "@/types/scheduling";

interface DoctorDetailsCardProps {
  doctor: DoctorDetail;
}

/** Admin: edit the specialty and department patients see on the doctor list. */
export function DoctorDetailsCard({ doctor }: DoctorDetailsCardProps) {
  const update = useUpdateDoctorDetails(doctor.id);
  // Drafts; null shows the saved value.
  const [specialty, setSpecialty] = useState<string | null>(null);
  const [department, setDepartment] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const specialtyValue = specialty ?? doctor.specialty;
  const departmentValue = department ?? doctor.department;
  const dirty =
    specialtyValue.trim() !== doctor.specialty ||
    departmentValue.trim() !== doctor.department;

  const save = async () => {
    setMessage(null);
    setError(null);
    try {
      await update.mutateAsync({ specialty: specialtyValue, department: departmentValue });
      setSpecialty(null);
      setDepartment(null);
      setMessage("Doctor details saved.");
    } catch (cause) {
      setError(cause instanceof SchedulingError ? cause.message : "Could not save.");
    }
  };

  return (
    <Card style={{ gap: 12 }}>
      <Text className="text-base font-semibold text-ink">Doctor details</Text>
      <Text className="text-sm text-ink-muted">Shown to patients on the doctor list.</Text>
      <View className="gap-1">
        <Text className="text-sm font-medium text-ink">Specialty</Text>
        <FormTextInput
          accessibilityLabel="Specialty"
          onChangeText={setSpecialty}
          value={specialtyValue}
        />
      </View>
      <View className="gap-1">
        <Text className="text-sm font-medium text-ink">Department</Text>
        <FormTextInput
          accessibilityLabel="Department"
          onChangeText={setDepartment}
          value={departmentValue}
        />
      </View>
      {error ? (
        <Text accessibilityLiveRegion="polite" className="text-sm text-danger">
          {error}
        </Text>
      ) : null}
      {message ? (
        <Text accessibilityLiveRegion="polite" className="text-sm text-available">
          {message}
        </Text>
      ) : null}
      <Pressable
        accessibilityLabel="Save doctor details"
        accessibilityRole="button"
        accessibilityState={{ disabled: !dirty || update.isPending, busy: update.isPending }}
        className={[
          "min-h-12 items-center justify-center rounded-xl px-4 web:hover:opacity-90",
          dirty ? "bg-primary" : "bg-ink-muted opacity-60",
        ].join(" ")}
        disabled={!dirty || update.isPending}
        onPress={() => void save()}
      >
        {update.isPending ? (
          <ActivityIndicator color={colors.surface} />
        ) : (
          <Text className="text-base font-semibold text-surface">Save details</Text>
        )}
      </Pressable>
    </Card>
  );
}
