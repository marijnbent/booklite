export type FontSizeOption = "small" | "medium" | "large" | "xlarge" | "xxlarge";
export type FontFamilyOption = "publisher" | "serif" | "sans";
export type ThemeOption = "paper" | "sepia" | "night";
export type ResolvedAppTheme = "light" | "dark";

export type ReaderSettings = {
  fontSize: FontSizeOption;
  fontFamily: FontFamilyOption;
  theme: ThemeOption;
};

type StoredReaderSettings = Partial<ReaderSettings>;

export const READER_SETTINGS_KEY = "booklite_reader_settings_v2";

export const defaultReaderSettings: ReaderSettings = {
  fontSize: "medium",
  fontFamily: "serif",
  theme: "paper",
};

export const fontSizeValues: FontSizeOption[] = ["small", "medium", "large", "xlarge", "xxlarge"];
export const fontSizeMap: Record<FontSizeOption, string> = {
  small: "90%",
  medium: "100%",
  large: "110%",
  xlarge: "125%",
  xxlarge: "150%",
};
export const fontSizeLabelMap: Record<FontSizeOption, string> = {
  small: "0.9",
  medium: "1.0",
  large: "1.1",
  xlarge: "1.25",
  xxlarge: "1.5",
};
export const fontFamilyMap: Record<FontFamilyOption, string | null> = {
  publisher: null,
  serif: `Georgia, "Iowan Old Style", "Palatino Linotype", serif`,
  sans: `"Helvetica Neue", Arial, sans-serif`,
};
export const themeStyles: Record<ThemeOption, { bg: string; text: string; surface: string }> = {
  paper: { bg: "bg-[#fffaf0]", text: "text-[#1f2937]", surface: "#fffaf0" },
  sepia: { bg: "bg-[#f3e6cd]", text: "text-[#433422]", surface: "#f3e6cd" },
  night: { bg: "bg-[#171923]", text: "text-[#e5e7eb]", surface: "#171923" },
};

export const getDefaultReaderTheme = (resolvedTheme: ResolvedAppTheme = "light"): ThemeOption =>
  resolvedTheme === "dark" ? "night" : defaultReaderSettings.theme;

export const getDefaultReaderSettings = (resolvedTheme: ResolvedAppTheme = "light"): ReaderSettings => ({
  ...defaultReaderSettings,
  theme: getDefaultReaderTheme(resolvedTheme),
});

const readRawStoredSettings = (): StoredReaderSettings | null => {
  try {
    const raw = localStorage.getItem(READER_SETTINGS_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;

    return parsed as StoredReaderSettings;
  } catch {
    return null;
  }
};

export const readStoredSettings = (resolvedTheme: ResolvedAppTheme = "light"): ReaderSettings => {
  const defaults = getDefaultReaderSettings(resolvedTheme);
  const stored = readRawStoredSettings();
  if (!stored) return defaults;

  return { ...defaults, ...stored };
};

export const hasStoredManualThemePreference = (
  resolvedTheme: ResolvedAppTheme = "light"
): boolean => {
  const stored = readRawStoredSettings();
  if (!stored?.theme) return false;

  return stored.theme !== getDefaultReaderTheme(resolvedTheme);
};

export const writeStoredSettings = (
  settings: ReaderSettings,
  options?: { persistTheme?: boolean }
): void => {
  const stored: StoredReaderSettings = {
    fontSize: settings.fontSize,
    fontFamily: settings.fontFamily,
  };

  if (options?.persistTheme) {
    stored.theme = settings.theme;
  }

  localStorage.setItem(READER_SETTINGS_KEY, JSON.stringify(stored));
};
