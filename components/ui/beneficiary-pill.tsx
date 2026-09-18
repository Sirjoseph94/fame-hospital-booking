import { Pressable, Text } from "react-native";

import type { BeneficiaryRelationship } from "@/types/scheduling";

interface BeneficiaryPillProps {
  displayName: string;
  relationship: BeneficiaryRelationship;
  selected?: boolean;
  onPress?: () => void;
}

function relationshipLabel(relationship: BeneficiaryRelationship): string {
  if (relationship === "self") {
    return "Self";
  }
  return relationship.charAt(0).toUpperCase() + relationship.slice(1);
}

export function BeneficiaryPill({
  displayName,
  relationship,
  selected = false,
  onPress,
}: BeneficiaryPillProps) {
  const label = `${displayName}, ${relationshipLabel(relationship)}`;

  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      className={[
        "min-h-12 justify-center rounded-full border px-4 py-2 web:hover:opacity-90",
        selected
          ? "border-primary bg-primary"
          : "border-ink-muted bg-surface",
      ].join(" ")}
      onPress={onPress}
    >
      <Text
        className={[
          "text-base font-medium",
          selected ? "text-surface" : "text-ink",
        ].join(" ")}
        numberOfLines={1}
      >
        {displayName}
        <Text
          className={selected ? "text-surface/90" : "text-ink-muted"}
        >{` · ${relationshipLabel(relationship)}`}</Text>
      </Text>
    </Pressable>
  );
}
