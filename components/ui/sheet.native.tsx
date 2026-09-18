import { useEffect, useRef } from "react";
import { Text, View } from "react-native";
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetView,
  type BottomSheetBackdropProps,
} from "@gorhom/bottom-sheet";
import { useReducedMotion } from "react-native-reanimated";

import type { SheetProps } from "@/components/ui/sheet.types";

export function Sheet({
  open,
  onOpenChange,
  title,
  accessibilityLabel,
  children,
}: SheetProps) {
  const ref = useRef<BottomSheetModal>(null);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (open) {
      ref.current?.present();
      return;
    }
    ref.current?.dismiss();
  }, [open]);

  const renderBackdrop = (props: BottomSheetBackdropProps) => (
    <BottomSheetBackdrop
      {...props}
      appearsOnIndex={0}
      disappearsOnIndex={-1}
      accessibilityLabel="Close sheet"
      pressBehavior="close"
    />
  );

  return (
    <BottomSheetModal
      ref={ref}
      accessibilityLabel={accessibilityLabel ?? title}
      animateOnMount={!reduceMotion}
      backdropComponent={renderBackdrop}
      enablePanDownToClose
      onDismiss={() => onOpenChange(false)}
      snapPoints={["50%", "90%"]}
    >
      <BottomSheetView className="gap-4 px-4 pb-8">
        <Text accessibilityRole="header" className="text-lg font-bold text-ink">
          {title}
        </Text>
        <View className="gap-3">{children}</View>
      </BottomSheetView>
    </BottomSheetModal>
  );
}
