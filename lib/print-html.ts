import * as Print from "expo-print";

/**
 * iOS/Android: the system print sheet (also lets people save a PDF).
 * Cancelling the sheet isn't an error.
 */
export async function printHtml(html: string): Promise<void> {
  try {
    await Print.printAsync({ html });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    if (/cancel|did not complete|not completed/i.test(message)) {
      return;
    }
    throw cause;
  }
}
