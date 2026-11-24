import { useState } from "react";

/**
 * Latches to true the first time `hasData` is true. Lets a screen tell its
 * very first load (full-screen skeleton) apart from later loads of a new
 * query key, e.g. another day or week (inline skeleton).
 */
export function useHasLoadedOnce(hasData: boolean): boolean {
  const [loaded, setLoaded] = useState(hasData);
  // Adjusting state during render (guarded) is React's recommended way to
  // derive state from props without an extra effect pass.
  if (hasData && !loaded) {
    setLoaded(true);
  }
  return loaded || hasData;
}
