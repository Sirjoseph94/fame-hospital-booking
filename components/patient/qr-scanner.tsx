import { useEffect, useRef } from "react";
import { AppState, Linking, Pressable, Text, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";

import { checkInCodeFromScan } from "@/lib/services/scheduling";

export interface QrScannerProps {
  /** Called once with a valid check-in code. */
  onCode: (code: string) => void;
  /** Called when something that isn't a check-in code was scanned. */
  onInvalid?: () => void;
}

/** True where an in-app scanner exists (iOS/Android). */
export const canScanQr = true;

/** Camera view that reads the reception check-in QR code. */
export function QrScanner({ onCode, onInvalid }: QrScannerProps) {
  const [permission, requestPermission, getPermission] = useCameraPermissions();
  // Coming back from Settings: pick up a newly granted permission.
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void getPermission();
    });
    return () => subscription.remove();
  }, [getPermission]);
  // The camera fires many events per second; act on the first good one.
  const handled = useRef(false);
  const lastInvalid = useRef(0);

  if (!permission) {
    return <View className="h-64 rounded-2xl bg-ink/90" />;
  }

  if (!permission.granted) {
    return (
      <View className="h-64 items-center justify-center gap-3 rounded-2xl bg-surface-muted px-4">
        <Text className="text-center text-base text-ink">
          Allow camera access to scan the code at reception.
        </Text>
        <Pressable
          accessibilityRole="button"
          className="min-h-12 items-center justify-center rounded-xl bg-primary px-5 active:opacity-80"
          onPress={() => {
            if (permission.canAskAgain) {
              void requestPermission();
            } else {
              void Linking.openSettings();
            }
          }}
        >
          <Text className="text-base font-semibold text-surface">
            {permission.canAskAgain ? "Allow camera" : "Open Settings"}
          </Text>
        </Pressable>
        <Text className="text-center text-sm text-ink-muted">Or type the code below.</Text>
      </View>
    );
  }

  return (
    <View className="h-64 overflow-hidden rounded-2xl bg-ink">
      <CameraView
        barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
        facing="back"
        onBarcodeScanned={({ data }) => {
          if (handled.current) return;
          const code = checkInCodeFromScan(data);
          if (code) {
            handled.current = true;
            onCode(code);
          } else if (Date.now() - lastInvalid.current > 3000) {
            lastInvalid.current = Date.now();
            onInvalid?.();
          }
        }}
        style={{ flex: 1 }}
      />
      <View pointerEvents="none" className="absolute inset-0 items-center justify-center">
        <View className="h-44 w-44 rounded-3xl border-4 border-surface/80" />
      </View>
    </View>
  );
}
