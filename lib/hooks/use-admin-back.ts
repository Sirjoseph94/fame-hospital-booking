import { router } from "expo-router";

import { useBreakpoint } from "@/lib/platform";

/**
 * Phones reach Reports / Activity / Settings from the "More" tab, so those
 * screens show a back button to it. Wide screens list them in the side nav.
 */
export function useAdminBack(): (() => void) | undefined {
  const breakpoint = useBreakpoint();
  if (breakpoint !== "phone") {
    return undefined;
  }
  return () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.navigate("/more");
    }
  };
}
