import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { persistentStorage } from "@/lib/storage";
import type { Session } from "@/types/scheduling";

interface SessionState {
  session: Session | null;
  authReady: boolean;
  hasHydrated: boolean;
  setSession: (session: Session | null) => void;
  setAuthReady: (authReady: boolean) => void;
  setHasHydrated: (hasHydrated: boolean) => void;
}

export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
      session: null,
      authReady: false,
      hasHydrated: false,
      setSession: (session) => set({ session }),
      setAuthReady: (authReady) => set({ authReady }),
      setHasHydrated: (hasHydrated) => set({ hasHydrated }),
    }),
    {
      name: "fame-session",
      storage: createJSONStorage(() => persistentStorage),
      partialize: ({ session }) => ({ session }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    },
  ),
);
