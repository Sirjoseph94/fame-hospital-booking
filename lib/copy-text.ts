import { Platform, Share } from "react-native";

export async function copyText(text: string): Promise<boolean> {
  if (Platform.OS === "web") {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }

  try {
    await Share.share({ message: text });
    return true;
  } catch {
    return false;
  }
}
