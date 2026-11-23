import { Alert, Platform } from "react-native";

export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
}

/**
 * Cross-platform confirmation prompt.
 * react-native-web's Alert.alert is a no-op, so web falls back to window.confirm.
 */
export function confirmAsync({
  title,
  message,
  confirmText = "OK",
  cancelText = "Cancel",
  destructive = false,
}: ConfirmOptions): Promise<boolean> {
  if (Platform.OS === "web") {
    const text = message ? `${title}\n\n${message}` : title;
    const confirmFn = (globalThis as { confirm?: (text: string) => boolean })
      .confirm;
    return Promise.resolve(confirmFn ? confirmFn(text) : true);
  }

  return new Promise((resolve) => {
    Alert.alert(
      title,
      message,
      [
        { text: cancelText, style: "cancel", onPress: () => resolve(false) },
        {
          text: confirmText,
          style: destructive ? "destructive" : "default",
          onPress: () => resolve(true),
        },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}

/** Cross-platform informational alert (window.alert on web). */
export function showAlert(title: string, message?: string): void {
  if (Platform.OS === "web") {
    const alertFn = (globalThis as { alert?: (text: string) => void }).alert;
    alertFn?.(message ? `${title}\n\n${message}` : title);
    return;
  }
  Alert.alert(title, message);
}
