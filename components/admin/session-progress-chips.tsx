import { Text, View } from "react-native";

import type { SessionProgress } from "@/types/scheduling";

type Counts = Pick<SessionProgress, "notArrived" | "waiting" | "withDoctor" | "seen" | "noShow">;

const ITEMS: { key: keyof Counts; label: string; tone: string }[] = [
  { key: "waiting", label: "Waiting", tone: "text-primary" },
  { key: "withDoctor", label: "With doctor", tone: "text-available" },
  { key: "seen", label: "Seen", tone: "text-ink" },
  { key: "noShow", label: "No-show", tone: "text-danger" },
  { key: "notArrived", label: "Not arrived", tone: "text-ink-muted" },
];

/** "Waiting 3 · With doctor 1 · Seen 5 …" as compact tiles. */
export function SessionProgressChips({ progress }: { progress: Counts }) {
  const summary = ITEMS.map(({ key, label }) => `${label} ${progress[key]}`).join(", ");
  return (
    <View accessibilityLabel={summary} className="flex-row flex-wrap gap-2">
      {ITEMS.map(({ key, label, tone }) => (
        <View key={key} className="min-w-[30%] flex-1 rounded-xl bg-surface-muted px-3 py-2">
          <Text className={`text-lg font-bold ${tone}`}>{progress[key]}</Text>
          <Text className="text-xs text-ink-muted" numberOfLines={1}>
            {label}
          </Text>
        </View>
      ))}
    </View>
  );
}

/** Adds up per-session counts for a day summary. */
export function sumProgress(rows: Counts[]): Counts {
  return rows.reduce<Counts>(
    (total, row) => ({
      notArrived: total.notArrived + row.notArrived,
      waiting: total.waiting + row.waiting,
      withDoctor: total.withDoctor + row.withDoctor,
      seen: total.seen + row.seen,
      noShow: total.noShow + row.noShow,
    }),
    { notArrived: 0, waiting: 0, withDoctor: 0, seen: 0, noShow: 0 },
  );
}
