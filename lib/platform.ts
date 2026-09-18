import { Platform, useWindowDimensions } from "react-native";

export const isWeb = Platform.OS === "web";
export const isNative = !isWeb;
export const isIOS = Platform.OS === "ios";
export const isAndroid = Platform.OS === "android";

export const breakpoints = {
  tablet: 768,
  desktop: 1024,
} as const;

export type Breakpoint = "phone" | "tablet" | "desktop";

export function getBreakpoint(width: number): Breakpoint {
  if (width < breakpoints.tablet) {
    return "phone";
  }

  if (width <= breakpoints.desktop) {
    return "tablet";
  }

  return "desktop";
}

export function useBreakpoint(): Breakpoint {
  const { width } = useWindowDimensions();
  return getBreakpoint(width);
}

export function selectPlatform<T>(values: {
  ios?: T;
  android?: T;
  web?: T;
  native?: T;
  default: T;
}): T {
  return Platform.select(values) ?? values.default;
}
