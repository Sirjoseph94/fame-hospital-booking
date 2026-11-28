import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { X } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { breakpoints } from "@/lib/platform";
import { colors } from "@/lib/theme-colors";

import type { SheetProps } from "./sheet.types";

export type { SheetProps } from "./sheet.types";

/**
 * Run `next` (an Alert, or opening another sheet) once a sheet that was just
 * closed has finished animating away: iOS won't present over a sheet that is
 * still dismissing, and silently drops the second presentation.
 */
export function afterSheetCloses(next: () => void): void {
  setTimeout(next, Platform.OS === "ios" ? 500 : 0);
}

function SheetHeader({ title, onClose, showHandle }: { title: string; onClose: () => void; showHandle: boolean }) {
  return (
    <View className="px-4 pt-2">
      {showHandle ? <View className="mb-2 h-1 w-10 self-center rounded-full bg-ink-muted/40" /> : null}
      <View className="flex-row items-center gap-2">
        <Text accessibilityRole="header" className="min-w-0 flex-1 text-lg font-bold text-ink" numberOfLines={2}>
          {title}
        </Text>
        <Pressable
          accessibilityLabel="Close"
          accessibilityRole="button"
          className="h-12 w-12 items-center justify-center rounded-full web:hover:bg-surface-muted active:opacity-70"
          hitSlop={4}
          onPress={onClose}
        >
          <X color={colors.ink} size={22} />
        </Pressable>
      </View>
    </View>
  );
}

/**
 * Modal sheet for short tasks (forms, pickers, confirmations).
 *   iOS: the native page sheet (swipe down to close).
 *   Android: a bottom card over a dimmed backdrop (back button closes).
 *   Web: a bottom card on phones, a centred dialog on wide screens (Esc closes).
 * Content scrolls and stays above the keyboard; there is always a Close button.
 */
export function Sheet({ open, onOpenChange, title, accessibilityLabel, children }: SheetProps) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const close = () => onOpenChange(false);

  if (Platform.OS === "ios") {
    return (
      <Modal
        allowSwipeDismissal
        animationType="slide"
        onRequestClose={close}
        presentationStyle="pageSheet"
        visible={open}
      >
        <View accessibilityLabel={accessibilityLabel ?? title} accessibilityViewIsModal className="flex-1 bg-surface">
          <SheetHeader showHandle onClose={close} title={title} />
          <KeyboardAvoidingView behavior="padding" className="flex-1">
            <ScrollView
              automaticallyAdjustKeyboardInsets
              contentContainerClassName="gap-3 px-4 pt-2"
              contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
              keyboardDismissMode="interactive"
              keyboardShouldPersistTaps="handled"
            >
              {children}
            </ScrollView>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    );
  }

  const centred = Platform.OS === "web" && width >= breakpoints.tablet;

  return (
    <Modal
      animationType={centred ? "fade" : "slide"}
      navigationBarTranslucent
      onRequestClose={close}
      statusBarTranslucent
      transparent
      visible={open}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "android" ? "padding" : undefined}
        className={centred ? "flex-1 items-center justify-center px-4" : "flex-1 justify-end"}
      >
        <Pressable
          accessibilityLabel="Close"
          accessibilityRole="button"
          className="absolute inset-0 bg-ink/40 web:cursor-default"
          onPress={close}
        />
        <View
          accessibilityLabel={accessibilityLabel ?? title}
          accessibilityViewIsModal
          aria-modal
          className={centred ? "w-full max-w-lg rounded-2xl bg-surface" : "w-full rounded-t-2xl bg-surface"}
          role="dialog"
          style={{ maxHeight: height * (centred ? 0.85 : 0.9), paddingBottom: centred ? 8 : insets.bottom }}
        >
          <SheetHeader onClose={close} showHandle={!centred} title={title} />
          <ScrollView
            contentContainerClassName="gap-3 px-4 pb-6 pt-2"
            keyboardShouldPersistTaps="handled"
          >
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
