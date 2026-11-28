import { create } from "zustand";

/**
 * A check-in code from a scanned poster link that arrived while signed out.
 * Kept in memory only: after sign-in, patient Home sends them back to check in.
 */
interface PendingCheckInState {
  code: string | null;
  setCode: (code: string | null) => void;
}

export const usePendingCheckIn = create<PendingCheckInState>()((set) => ({
  code: null,
  setCode: (code) => set({ code }),
}));
