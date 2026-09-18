import { Modal, Pressable, Text, View } from "react-native";

import type { SheetProps } from "@/components/ui/sheet.types";

export function Sheet({
  open,
  onOpenChange,
  title,
  accessibilityLabel,
  children,
}: SheetProps) {
  return (
    <Modal
      animationType="slide"
      onRequestClose={() => onOpenChange(false)}
      transparent
      visible={open}
    >
      <View className="flex-1 justify-end">
        <Pressable
          accessibilityLabel="Close sheet backdrop"
          accessibilityRole="button"
          className="absolute inset-0 bg-ink/40 web:cursor-default"
          onPress={() => onOpenChange(false)}
        />
        <View
          accessibilityLabel={accessibilityLabel ?? title}
          accessibilityRole="none"
          className="max-h-[90%] rounded-t-2xl bg-surface px-4 pb-8 pt-4"
        >
          <View className="mb-4 h-1 w-12 self-center rounded-full bg-ink-muted/40" />
          <Text accessibilityRole="header" className="text-lg font-bold text-ink">
            {title}
          </Text>
          <View className="mt-4 gap-3">{children}</View>
        </View>
      </View>
    </Modal>
  );
}
