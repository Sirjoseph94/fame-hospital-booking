import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { persistentStorage } from "@/lib/storage";

interface PatientBookingPrefsState {
  /** When null, booking uses the account holder's "self" beneficiary. */
  selectedBeneficiaryId: string | null;
  setSelectedBeneficiaryId: (beneficiaryId: string | null) => void;
  resetToSelf: () => void;
}

export const usePatientBookingPrefs = create<PatientBookingPrefsState>()(
  persist(
    (set) => ({
      selectedBeneficiaryId: null,
      setSelectedBeneficiaryId: (beneficiaryId) =>
        set({ selectedBeneficiaryId: beneficiaryId }),
      resetToSelf: () => set({ selectedBeneficiaryId: null }),
    }),
    {
      name: "fame-patient-booking-prefs",
      storage: createJSONStorage(() => persistentStorage),
    },
  ),
);
