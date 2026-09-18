import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { persistentStorage } from "@/lib/storage";
import type { AppointmentDbStatus } from "@/types/scheduling";

interface VisitStatusSnapshotState {
  byAppointmentId: Record<string, AppointmentDbStatus>;
  mergeStatuses: (
    next: Record<string, AppointmentDbStatus>,
  ) => string[];
  clear: () => void;
}

export const useVisitStatusSnapshot = create<VisitStatusSnapshotState>()(
  persist(
    (set, get) => ({
      byAppointmentId: {},
      mergeStatuses: (next) => {
        const previous = get().byAppointmentId;
        const announcements: string[] = [];

        for (const [id, dbStatus] of Object.entries(next)) {
          const was = previous[id];
          if (was === "pending" && dbStatus === "confirmed") {
            announcements.push("A visit was confirmed by your doctor.");
          }
        }

        set({ byAppointmentId: next });
        return announcements;
      },
      clear: () => set({ byAppointmentId: {} }),
    }),
    {
      name: "fame-visit-status-snapshot",
      storage: createJSONStorage(() => persistentStorage),
    },
  ),
);
