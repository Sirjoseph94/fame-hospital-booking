// Hospital-wide scheduling settings.

import { supabase } from "@/lib/supabase";

import { SchedulingError } from "./errors";
import {
  asNetworkError,
  consumeFailure,
  fetchBufferMinutes,
  wait,
} from "./internal";
import type { SchedulingService } from "./types";

export const settingsMethods: Pick<
  SchedulingService,
  "getSettings" | "updateBufferMinutes"
> = {
  async getSettings() {
    await wait();
    consumeFailure("NETWORK_ERROR");

    try {
      return { bufferMinutes: await fetchBufferMinutes() };
    } catch (error) {
      if (error instanceof SchedulingError) {
        throw error;
      }
      asNetworkError(error);
    }
  },
  async updateBufferMinutes(minutes) {
    await wait();
    consumeFailure("NETWORK_ERROR");

    try {
      const bufferMinutes = Math.max(0, Math.round(minutes));
      const { data, error } = await supabase
        .from("hospital_settings")
        .update({ buffer_minutes: bufferMinutes, updated_at: new Date().toISOString() })
        .eq("id", 1)
        .select("buffer_minutes")
        .single();

      if (error || !data) {
        asNetworkError(error ?? new Error("Settings update failed."));
      }

      return { bufferMinutes: data.buffer_minutes as number };
    } catch (error) {
      if (error instanceof SchedulingError) {
        throw error;
      }
      asNetworkError(error);
    }
  },
};
