import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  readStoredSettings,
  defaultReaderSettings,
  READER_SETTINGS_KEY,
  getDefaultReaderSettings,
  hasStoredManualThemePreference,
  writeStoredSettings,
} from "../components/reader/readerSettings";

// jsdom's localStorage does not expose .clear() in all environments,
// so we stub it with a simple Map-backed implementation.
function makeLocalStorageMock() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
    removeItem: (key: string) => store.delete(key),
    clear: () => store.clear(),
    get length() { return store.size; },
    key: (index: number) => [...store.keys()][index] ?? null,
  };
}

describe("readStoredSettings", () => {
  let mockStorage: ReturnType<typeof makeLocalStorageMock>;

  beforeEach(() => {
    mockStorage = makeLocalStorageMock();
    vi.stubGlobal("localStorage", mockStorage);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns defaultReaderSettings when localStorage is empty", () => {
    const result = readStoredSettings();
    expect(result).toEqual(defaultReaderSettings);
  });

  it("uses night mode as the default reader theme when the app is dark", () => {
    const result = readStoredSettings("dark");
    expect(result).toEqual(getDefaultReaderSettings("dark"));
    expect(result.theme).toBe("night");
  });

  it("returns defaultReaderSettings when localStorage has invalid JSON", () => {
    localStorage.setItem(READER_SETTINGS_KEY, "not-valid-json{{{{");
    const result = readStoredSettings();
    expect(result).toEqual(defaultReaderSettings);
  });

  it("merges stored partial settings with defaults (only theme stored)", () => {
    localStorage.setItem(READER_SETTINGS_KEY, JSON.stringify({ theme: "night" }));
    const result = readStoredSettings();
    expect(result.theme).toBe("night");
    expect(result.fontSize).toBe(defaultReaderSettings.fontSize);
    expect(result.fontFamily).toBe(defaultReaderSettings.fontFamily);
  });

  it("merges stored partial settings with defaults (only fontSize stored)", () => {
    localStorage.setItem(READER_SETTINGS_KEY, JSON.stringify({ fontSize: "xlarge" }));
    const result = readStoredSettings();
    expect(result.fontSize).toBe("xlarge");
    expect(result.theme).toBe(defaultReaderSettings.theme);
    expect(result.fontFamily).toBe(defaultReaderSettings.fontFamily);
  });

  it("merges stored partial settings with the dark-mode reader default", () => {
    localStorage.setItem(READER_SETTINGS_KEY, JSON.stringify({ fontSize: "xlarge" }));
    const result = readStoredSettings("dark");
    expect(result.fontSize).toBe("xlarge");
    expect(result.theme).toBe("night");
    expect(result.fontFamily).toBe(defaultReaderSettings.fontFamily);
  });

  it("returns all stored settings when all fields are present", () => {
    const stored = { fontSize: "large", fontFamily: "sans", theme: "sepia" };
    localStorage.setItem(READER_SETTINGS_KEY, JSON.stringify(stored));
    const result = readStoredSettings();
    expect(result).toEqual({ fontSize: "large", fontFamily: "sans", theme: "sepia" });
  });

  it("treats the app-default theme as auto-follow, not a manual override", () => {
    localStorage.setItem(READER_SETTINGS_KEY, JSON.stringify({ theme: "night" }));
    expect(hasStoredManualThemePreference("dark")).toBe(false);
  });

  it("treats non-default themes as manual overrides", () => {
    localStorage.setItem(READER_SETTINGS_KEY, JSON.stringify({ theme: "sepia" }));
    expect(hasStoredManualThemePreference("dark")).toBe(true);
  });

  it("omits the theme from storage when the reader should keep following the app theme", () => {
    writeStoredSettings(
      { fontSize: "large", fontFamily: "sans", theme: "night" },
      { persistTheme: false }
    );

    expect(localStorage.getItem(READER_SETTINGS_KEY)).toBe(
      JSON.stringify({ fontSize: "large", fontFamily: "sans" })
    );
  });

  it("persists the theme when the reader has a manual theme override", () => {
    writeStoredSettings(
      { fontSize: "large", fontFamily: "sans", theme: "sepia" },
      { persistTheme: true }
    );

    expect(localStorage.getItem(READER_SETTINGS_KEY)).toBe(
      JSON.stringify({ fontSize: "large", fontFamily: "sans", theme: "sepia" })
    );
  });
});
