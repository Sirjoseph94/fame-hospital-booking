import type { QrScannerProps } from "./qr-scanner";

export type { QrScannerProps };

/** The web app types the code instead (no camera scanning in the browser build). */
export const canScanQr = false;

export function QrScanner(_props: QrScannerProps) {
  return null;
}
