import * as SecureStore from "expo-secure-store";
import type { StateStorage } from "zustand/middleware";

import { isWeb } from "@/lib/platform";

function webStorage(): Storage | null {
  if (!isWeb || typeof globalThis.localStorage === "undefined") {
    return null;
  }
  return globalThis.localStorage;
}

export const persistentStorage = {
  async getItem(name) {
    const storage = webStorage();
    if (storage) {
      return storage.getItem(name);
    }
    return SecureStore.getItemAsync(name);
  },

  async setItem(name, value) {
    const storage = webStorage();
    if (storage) {
      storage.setItem(name, value);
      return;
    }
    await SecureStore.setItemAsync(name, value);
  },

  async removeItem(name) {
    const storage = webStorage();
    if (storage) {
      storage.removeItem(name);
      return;
    }
    await SecureStore.deleteItemAsync(name);
  },
} satisfies StateStorage;
