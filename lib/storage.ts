import * as SecureStore from "expo-secure-store";
import type { StateStorage } from "zustand/middleware";

import { isWeb } from "@/lib/platform";

function webStorage(): Storage | null {
  if (!isWeb || typeof globalThis.localStorage === "undefined") {
    return null;
  }
  return globalThis.localStorage;
}

/**
 * SecureStore warns (and can fail on some devices) for values over ~2 KB.
 * Supabase sessions routinely exceed that, so large values are split across
 * `${name}.0`, `${name}.1`, … with the chunk count stored under
 * `${name}.chunks`. Values written by older builds under the plain key are
 * still read and cleaned up.
 */
const CHUNK_SIZE = 1800;

function chunkCountKey(name: string): string {
  return `${name}.chunks`;
}

function chunkKey(name: string, index: number): string {
  return `${name}.${index}`;
}

async function readChunkCount(name: string): Promise<number> {
  const raw = await SecureStore.getItemAsync(chunkCountKey(name));
  const count = raw ? Number.parseInt(raw, 10) : 0;
  return Number.isFinite(count) && count > 0 ? count : 0;
}

async function removeNative(name: string): Promise<void> {
  const count = await readChunkCount(name);
  const deletions: Promise<void>[] = [
    SecureStore.deleteItemAsync(name),
    SecureStore.deleteItemAsync(chunkCountKey(name)),
  ];
  for (let i = 0; i < count; i += 1) {
    deletions.push(SecureStore.deleteItemAsync(chunkKey(name, i)));
  }
  await Promise.all(deletions);
}

async function getNative(name: string): Promise<string | null> {
  const count = await readChunkCount(name);
  if (count === 0) {
    // Legacy single-key value (or small value).
    return SecureStore.getItemAsync(name);
  }

  const parts = await Promise.all(
    Array.from({ length: count }, (_, i) =>
      SecureStore.getItemAsync(chunkKey(name, i)),
    ),
  );
  if (parts.some((part) => part === null)) {
    // Partially written / corrupted — treat as missing.
    await removeNative(name);
    return null;
  }
  return parts.join("");
}

async function setNative(name: string, value: string): Promise<void> {
  await removeNative(name);

  if (value.length <= CHUNK_SIZE) {
    await SecureStore.setItemAsync(name, value);
    return;
  }

  const count = Math.ceil(value.length / CHUNK_SIZE);
  for (let i = 0; i < count; i += 1) {
    await SecureStore.setItemAsync(
      chunkKey(name, i),
      value.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE),
    );
  }
  // Written last so a crash mid-write never yields a truncated value.
  await SecureStore.setItemAsync(chunkCountKey(name), String(count));
}

export const persistentStorage = {
  async getItem(name) {
    const storage = webStorage();
    if (storage) {
      return storage.getItem(name);
    }
    return getNative(name);
  },

  async setItem(name, value) {
    const storage = webStorage();
    if (storage) {
      storage.setItem(name, value);
      return;
    }
    await setNative(name, value);
  },

  async removeItem(name) {
    const storage = webStorage();
    if (storage) {
      storage.removeItem(name);
      return;
    }
    await removeNative(name);
  },
} satisfies StateStorage;
