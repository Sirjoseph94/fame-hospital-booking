import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { persistentStorage } from "@/lib/storage";
import type {
  AppointmentType,
  SlotHold,
} from "@/types/scheduling";

interface BookingState {
  beneficiaryId: string | null;
  doctorId: string | null;
  doctorName: string | null;
  slotId: string | null;
  slotStartsAt: string | null;
  hold: SlotHold | null;
  appointmentType: AppointmentType;
  reason: string;
  notes: string;
  visitAddress: string;
  skipIntake: boolean;
  setBeneficiaryId: (beneficiaryId: string | null) => void;
  setDoctor: (doctorId: string, doctorName: string) => void;
  setSlot: (slotId: string, startsAt: string, hold: SlotHold) => void;
  setHold: (hold: SlotHold | null) => void;
  setAppointmentType: (appointmentType: AppointmentType) => void;
  setIntake: (reason: string, notes: string, visitAddress?: string) => void;
  beginReturningFlow: (input: {
    beneficiaryId: string;
    doctorId: string;
    doctorName: string;
    appointmentType: AppointmentType;
  }) => void;
  beginStandardFlow: (beneficiaryId: string) => void;
  resetBookingDraft: () => void;
}

const initialDraft = {
  beneficiaryId: null as string | null,
  doctorId: null as string | null,
  doctorName: null as string | null,
  slotId: null as string | null,
  slotStartsAt: null as string | null,
  hold: null as SlotHold | null,
  appointmentType: "in-clinic" as AppointmentType,
  reason: "",
  notes: "",
  visitAddress: "",
  skipIntake: false,
};

export const useBookingStore = create<BookingState>()(
  persist(
    (set) => ({
      ...initialDraft,
      setBeneficiaryId: (beneficiaryId) => set({ beneficiaryId }),
      setDoctor: (doctorId, doctorName) =>
        set({ doctorId, doctorName, slotId: null, slotStartsAt: null, hold: null }),
      setSlot: (slotId, startsAt, hold) =>
        set({ slotId, slotStartsAt: startsAt, hold }),
      setHold: (hold) => set({ hold }),
      setAppointmentType: (appointmentType) => set({ appointmentType }),
      setIntake: (reason, notes, visitAddress = "") =>
        set({ reason, notes, visitAddress }),
      beginReturningFlow: ({ beneficiaryId, doctorId, doctorName, appointmentType }) =>
        set({
          ...initialDraft,
          beneficiaryId,
          doctorId,
          doctorName,
          appointmentType,
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
      name: "fame-booking-draft",
      storage: createJSONStorage(() => persistentStorage),
      partialize: (state) => ({
        beneficiaryId: state.beneficiaryId,
        doctorId: state.doctorId,
        doctorName: state.doctorName,
        slotId: state.slotId,
        slotStartsAt: state.slotStartsAt,
        hold: state.hold,
        appointmentType: state.appointmentType,
        reason: state.reason,
        notes: state.notes,
        visitAddress: state.visitAddress,
        skipIntake: state.skipIntake,
      }),
    },
  ),
);
