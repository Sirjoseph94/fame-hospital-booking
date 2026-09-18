import type { PropsWithChildren } from "react";
import { View } from "react-native";

interface SkeletonProps {
  className?: string;
  accessibilityLabel?: string;
}

export function Skeleton({
  className = "h-4 rounded-lg bg-surface-muted",
  accessibilityLabel = "Loading",
}: SkeletonProps) {
  return (
    <View
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="progressbar"
      className={`animate-pulse ${className}`}
    />
  );
}

export function CardSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <View className="gap-3 rounded-2xl bg-surface p-4">
      <Skeleton className="h-5 w-32 rounded-lg bg-surface-muted" />
      {Array.from({ length: lines }).map((_, index) => (
        <Skeleton
          key={index}
          className={[
            "h-4 rounded-lg bg-surface-muted",
            index === lines - 1 ? "w-48" : "w-full",
          ].join(" ")}
        />
      ))}
    </View>
  );
}

export function VisitListSkeleton({ count = 3 }: { count?: number }) {
  return (
    <View className="gap-3">
      {Array.from({ length: count }).map((_, index) => (
        <CardSkeleton key={index} lines={4} />
      ))}
    </View>
  );
}

export function SlotGridSkeleton() {
  return (
    <View className="flex-row flex-wrap gap-2">
      {Array.from({ length: 12 }).map((_, index) => (
        <Skeleton
          key={index}
          className="h-12 w-24 rounded-xl bg-surface-muted"
        />
      ))}
    </View>
  );
}

export function HomeScreenSkeleton() {
  return (
    <View className="gap-4 px-4 pt-2">
      <CardSkeleton lines={4} />
      <CardSkeleton lines={3} />
      <Skeleton className="h-12 w-full rounded-xl bg-surface-muted" />
    </View>
  );
}

export function ScreenLoadingSkeleton({ children }: PropsWithChildren) {
  return (
    <View className="flex-1 bg-surface-muted pt-2">{children}</View>
  );
}
