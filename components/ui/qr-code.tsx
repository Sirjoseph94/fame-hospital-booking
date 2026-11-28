import { useMemo } from "react";
import Svg, { Path, Rect } from "react-native-svg";
import createQr from "qrcode-generator";

interface QrCodeProps {
  value: string;
  size: number;
  /** Accessible description (the QR itself isn't readable by screen readers). */
  accessibilityLabel: string;
}

/** Quiet zone in modules around the code (the spec asks for 4). */
const QUIET = 4;

/** Path of the dark modules, one unit square each. */
export function qrPath(value: string): { path: string; modules: number } {
  const qr = createQr(0, "M");
  qr.addData(value);
  qr.make();
  const count = qr.getModuleCount();
  let path = "";
  for (let row = 0; row < count; row += 1) {
    for (let col = 0; col < count; col += 1) {
      if (qr.isDark(row, col)) {
        path += `M${col + QUIET} ${row + QUIET}h1v1h-1z`;
      }
    }
  }
  return { path, modules: count + QUIET * 2 };
}

/** Self-contained SVG string (for printing). */
export function qrSvgMarkup(value: string, size: number): string {
  const { path, modules } = qrPath(value);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${modules} ${modules}" shape-rendering="crispEdges"><rect width="${modules}" height="${modules}" fill="#fff"/><path d="${path}" fill="#000"/></svg>`;
}

export function QrCode({ value, size, accessibilityLabel }: QrCodeProps) {
  const { path, modules } = useMemo(() => qrPath(value), [value]);
  return (
    <Svg
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="image"
      height={size}
      viewBox={`0 0 ${modules} ${modules}`}
      width={size}
    >
      <Rect fill="#FFFFFF" height={modules} width={modules} />
      <Path d={path} fill="#000000" />
    </Svg>
  );
}
