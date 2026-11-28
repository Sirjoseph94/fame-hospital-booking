import { useEffect, useState } from "react";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { router } from "expo-router";
import { format, parseISO } from "date-fns";

import { ShellHeader } from "@/components/shell-header";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { FormTextInput } from "@/components/ui/form-text-input";
import { RefreshErrorNotice } from "@/components/ui/refresh-error-notice";
import { VisitListSkeleton } from "@/components/ui/skeleton";
import { usePatientSearch } from "@/lib/queries/patients";

/** Admin: find a patient by name, phone or hospital file number. */
export default function AdminPatientsScreen() {
  const [input, setInput] = useState("");
  const [term, setTerm] = useState("");
  const [userRefreshing, setUserRefreshing] = useState(false);

  // Search after typing pauses.
  useEffect(() => {
    const timer = setTimeout(() => setTerm(input), 300);
    return () => clearTimeout(timer);
  }, [input]);

  const searchQuery = usePatientSearch(term);
  const patients = searchQuery.data;

  const refresh = async () => {
    setUserRefreshing(true);
    try {
      await searchQuery.refetch();
    } finally {
      setUserRefreshing(false);
    }
  };

  return (
    <View className="flex-1 bg-surface-muted">
      <ShellHeader title="Patients" />
      <View className="gap-2 px-4 pb-3">
        <FormTextInput
          accessibilityLabel="Search patients"
          autoCapitalize="none"
          autoCorrect={false}
          onChangeText={setInput}
          placeholder="Name, phone or hospital file no."
          value={input}
        />
        <Text className="text-xs text-ink-muted">
          {term.trim() ? "Matching patients" : "Newest patients"} · up to 50
        </Text>
      </View>
      <ScrollView
        contentContainerClassName="gap-3 px-4 pb-8"
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={userRefreshing} onRefresh={() => void refresh()} />}
      >
        <RefreshErrorNotice
          message={
            searchQuery.isError
              ? searchQuery.error instanceof Error
                ? searchQuery.error.message
                : "Could not search patients."
              : null
          }
        />
        {!patients ? (
          <VisitListSkeleton count={4} />
        ) : patients.length === 0 ? (
          <EmptyState message={term.trim() ? "No patients match." : "No patients yet."} />
        ) : (
          patients.map((patient) => (
            <Pressable
              key={patient.id}
              accessibilityLabel={`Open ${patient.fullName}`}
              accessibilityRole="button"
              className="web:hover:opacity-95"
              onPress={() =>
                router.push({ pathname: "/patient/[id]", params: { id: patient.id } })
              }
            >
              <Card style={{ gap: 4 }}>
                <View className="flex-row items-center justify-between gap-3">
                  <Text className="min-w-0 flex-1 text-base font-semibold text-ink">
                    {patient.fullName}
                  </Text>
                  {!patient.isActive ? (
                    <View className="rounded-full border border-ink-muted px-2 py-0.5">
                      <Text className="text-xs font-semibold text-ink-muted">Inactive</Text>
                    </View>
                  ) : null}
                </View>
                <Text className="text-sm text-ink-muted">
                  {patient.phone ?? "No phone"}
                  {/* profiles.created_at is nullable; never crash the list on it. */}
                  {patient.createdAt
                    ? ` · joined ${format(parseISO(patient.createdAt), "MMM d, yyyy")}`
                    : ""}
                </Text>
              </Card>
            </Pressable>
          ))
        )}
      </ScrollView>
    </View>
  );
}
