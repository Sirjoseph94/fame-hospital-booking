// jest.mock calls are hoisted above these imports by babel-jest.
import * as SecureStore from "expo-secure-store";

import { persistentStorage } from "@/lib/storage";

const mockStore = new Map<string, string>();

jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(async (key: string) => mockStore.get(key) ?? null),
  setItemAsync: jest.fn(async (key: string, value: string) => {
    mockStore.set(key, value);
  }),
  deleteItemAsync: jest.fn(async (key: string) => {
    mockStore.delete(key);
  }),
}));
jest.mock("@/lib/platform", () => ({ isWeb: false }));

describe("persistentStorage (native, SecureStore)", () => {
  beforeEach(() => {
    mockStore.clear();
    jest.clearAllMocks();
  });

  it("stores small values under a single key", async () => {
    await persistentStorage.setItem("session", "small");
    expect(mockStore.get("session")).toBe("small");
    expect(await persistentStorage.getItem("session")).toBe("small");
  });

  it("splits large values into chunks under the SecureStore limit and reassembles them", async () => {
    const big = "x".repeat(5000);
    await persistentStorage.setItem("session", big);
    expect(mockStore.get("session.chunks")).toBe("3");
    for (const [key, value] of mockStore) {
      if (key !== "session.chunks") {
        expect(value.length).toBeLessThanOrEqual(1800);
      }
    }
    expect(await persistentStorage.getItem("session")).toBe(big);
  });

  it("writes the chunk count last so a partial write is never read back", async () => {
    await persistentStorage.setItem("session", "y".repeat(4000));
    const calls = (SecureStore.setItemAsync as jest.Mock).mock.calls.map((c) => c[0]);
    expect(calls[calls.length - 1]).toBe("session.chunks");
  });

  it("treats a missing chunk as no value and cleans up", async () => {
    await persistentStorage.setItem("session", "z".repeat(4000));
    mockStore.delete("session.1");
    expect(await persistentStorage.getItem("session")).toBeNull();
    expect(mockStore.size).toBe(0);
  });

  it("overwrites chunked data with a small value and removes old chunks", async () => {
    await persistentStorage.setItem("session", "w".repeat(4000));
    await persistentStorage.setItem("session", "tiny");
    expect([...mockStore.keys()]).toEqual(["session"]);
    await persistentStorage.removeItem("session");
    expect(mockStore.size).toBe(0);
  });

  it("still reads a legacy single-key value written by older builds", async () => {
    mockStore.set("session", "legacy-value");
    expect(await persistentStorage.getItem("session")).toBe("legacy-value");
  });
});
