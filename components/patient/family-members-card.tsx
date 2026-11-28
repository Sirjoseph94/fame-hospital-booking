import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { format, isValid, parseISO } from "date-fns";

import {
  AddBeneficiarySheet,
  type AddBeneficiaryFields,
} from "@/components/patient/add-beneficiary-sheet";
import { Card } from "@/components/ui/card";
import { confirmAsync, showAlert } from "@/lib/confirm";
import {
  useBeneficiaries,
  useRemoveBeneficiary,
  useUpdateBeneficiary,
} from "@/lib/queries/beneficiaries";
import { SchedulingError } from "@/lib/services/scheduling";
import type { Beneficiary } from "@/types/scheduling";

function describe(person: Beneficiary): string {
  const dob = parseISO(person.dob);
  const parts = [
    person.relationship === "self" ? "You" : person.relationship,
    isValid(dob) ? `born ${format(dob, "d MMM yyyy")}` : null,
    person.hospitalFileId ? `file ${person.hospitalFileId}` : null,
  ].filter(Boolean);
  return parts.join(" · ");
}

/** Profile card: the people this account books for, with edit and remove. */
export function FamilyMembersCard({ userId }: { userId: string }) {
  const beneficiariesQuery = useBeneficiaries(userId);
  const update = useUpdateBeneficiary(userId);
  const remove = useRemoveBeneficiary(userId);
  const [editing, setEditing] = useState<Beneficiary | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const people = (beneficiariesQuery.data ?? [])
    .filter((row) => !row.archived)
    .sort((left, right) =>
      left.relationship === "self" ? -1 : right.relationship === "self" ? 1 : left.displayName.localeCompare(right.displayName),
    );

  const save = async (values: AddBeneficiaryFields): Promise<boolean> => {
    if (!editing) {
      return false;
    }
    setEditError(null);
    try {
      await update.mutateAsync({
        beneficiaryId: editing.id,
        changes: {
          displayName: values.displayName,
          dob: values.dob,
          gender: values.gender,
          nationalId: values.nationalId,
          hospitalFileId: values.hospitalFileId,
          relationship: editing.relationship === "self" ? undefined : values.relationship,
        },
      });
      setMessage(`Saved ${values.displayName}.`);
      setEditing(null);
      return true;
    } catch (cause) {
      setEditError(cause instanceof SchedulingError ? cause.message : "Could not save.");
      return false;
    }
  };

  const confirmRemove = async (person: Beneficiary) => {
    const confirmed = await confirmAsync({
      title: `Remove ${person.displayName}?`,
      message: "They'll no longer appear when you book. Their past visits stay in My Visits.",
      confirmText: "Remove",
      cancelText: "Keep",
      destructive: true,
    });
    if (!confirmed) {
      return;
    }
    setMessage(null);
    try {
      await remove.mutateAsync(person.id);
      setMessage(`Removed ${person.displayName}.`);
    } catch (cause) {
      showAlert(
        "Could not remove",
        cause instanceof SchedulingError ? cause.message : "Could not remove this person.",
      );
    }
  };

  return (
    <Card style={{ gap: 12 }}>
      <Text className="text-base font-semibold text-ink">People you book for</Text>
      {beneficiariesQuery.isPending ? (
        <Text className="text-sm text-ink-muted">Loading…</Text>
      ) : people.length === 0 ? (
        <Text className="text-sm text-ink-muted">
          Nobody yet. Add family members from Home → Book for someone else.
        </Text>
      ) : (
        people.map((person) => (
          <View
            key={person.id}
            className="flex-row items-center justify-between gap-3 border-b border-surface-muted pb-3"
          >
            <View className="min-w-0 flex-1 gap-0.5">
              <Text className="text-base font-medium text-ink" selectable>
                {person.displayName}
              </Text>
              <Text className="text-sm capitalize text-ink-muted">{describe(person)}</Text>
            </View>
            <View className="flex-row gap-2">
              <Pressable
                accessibilityLabel={`Edit ${person.displayName}`}
                accessibilityRole="button"
                className="min-h-11 justify-center rounded-lg border border-primary px-3 web:hover:opacity-90"
                onPress={() => {
                  setEditError(null);
                  setEditing(person);
                }}
              >
                <Text className="text-sm font-semibold text-primary">Edit</Text>
              </Pressable>
              {person.relationship !== "self" ? (
                <Pressable
                  accessibilityLabel={`Remove ${person.displayName}`}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: remove.isPending }}
                  className="min-h-11 justify-center rounded-lg border border-ink-muted px-3 web:hover:opacity-90"
                  disabled={remove.isPending}
                  onPress={() => void confirmRemove(person)}
                >
                  <Text className="text-sm font-semibold text-ink-muted">Remove</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        ))
      )}
      {message ? (
        <Text accessibilityLiveRegion="polite" className="text-sm text-available">
          {message}
        </Text>
      ) : null}

      {editing ? (
        <AddBeneficiarySheet
          key={editing.id}
          errorMessage={editError}
          hideRelationship={editing.relationship === "self"}
          initialValues={{
            displayName: editing.displayName,
            relationship: editing.relationship === "self" ? "other" : editing.relationship,
            dob: editing.dob,
            gender: editing.gender === "male" || editing.gender === "female" ? editing.gender : undefined,
            nationalId: editing.nationalId ?? "",
            hospitalFileId: editing.hospitalFileId ?? "",
          }}
          open
          submitting={update.isPending}
          title={editing.relationship === "self" ? "Edit your details" : `Edit ${editing.displayName}`}
          onOpenChange={(open) => {
            if (!open) {
              setEditing(null);
            }
          }}
          onSubmit={save}
        />
      ) : null}
    </Card>
  );
}
