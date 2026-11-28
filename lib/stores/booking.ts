import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { persistentStorage } from "@/lib/storage";

/** The session picked in the booking flow (nothing is reserved until Book). */
export interface DraftSession {
  id: string;
  startsAt: string;
  endsAt: string;
}

interface BookingState {
  beneficiaryId: string | null;
  doctorId: string | null;
  doctorName: string | null;
  session: DraftSession | null;
  reason: string;
  notes: string;
  /** Returning patients skip the details step. */
  skipIntake: boolean;
  setBeneficiaryId: (beneficiaryId: string | null) => void;
  setDoctor: (doctorId: string, doctorName: string) => void;
  setSession: (session: DraftSession | null) => void;
  setIntake: (reason: string, notes: string) => void;
  beginReturningFlow: (input: {
    beneficiaryId: string;
    doctorId: string;
    doctorName: string;
  }) => void;
  beginStandardFlow: (beneficiaryId: string) => void;
  resetBookingDraft: () => void;
}

const initialDraft = {
  beneficiaryId: null as string | null,
  doctorId: null as string | null,
  doctorName: null as string | null,
  session: null as DraftSession | null,
  reason: "",
  notes: "",
  skipIntake: false,
};

export const useBookingStore = create<BookingState>()(
  persist(
    (set) => ({
      ...initialDraft,
      setBeneficiaryId: (beneficiaryId) => set({ beneficiaryId }),
      setDoctor: (doctorId, doctorName) =>
        set({ doctorId, doctorName, session: null }),
      setSession: (session) => set({ session }),
      setIntake: (reason, notes) => set({ reason, notes }),
      beginReturningFlow: ({ beneficiaryId, doctorId, doctorName }) =>
        set({
          ...initialDraft,
          beneficiaryId,
          doctorId,
          doctorName,
          skipIntake: true,
        }),
      beginStandardFlow: (beneficiaryId) =>
        set({
          ...initialDraft,
          beneficiaryId,
          skipIntake: false,
        }),
      resetBookingDraft: () => set({ ...initialDraft }),
    }),
    {
      // v2: sessions replaced slot holds; drop any v1 draft.
      name: "fame-booking-draft",
      version: 2,
      migrate: () => ({ ...initialDraft }),
      storage: createJSONStorage(() => persistentStorage),
      partialize: (state) => ({
        beneficiaryId: state.beneficiaryId,
        doctorId: state.doctorId,
        doctorName: state.doctorName,
        session: state.session,
        reason: state.reason,
        notes: state.notes,
        skipIntake: state.skipIntake,
      }),
    },
  ),
);
