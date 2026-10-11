import type { AccentColor } from "@booklite/shared";

export const accentPresets: Record<AccentColor, readonly [string, string]> = {
  orange: ["#f08a3c", "#f2c14e"],
  rose: ["#f0708f", "#f5a36b"],
  violet: ["#a48bfa", "#f08bd0"],
  blue: ["#6aa5fb", "#74e0d8"],
  teal: ["#45cdbd", "#9bdc6a"],
  green: ["#7ccf86", "#dcd95e"],
  none: ["var(--color-foreground)", "var(--color-foreground)"],
};

export function applyAccent(value: AccentColor | null) {
  const accent = value ?? "orange";
  document.documentElement.dataset.accent = accent;
  try { localStorage.setItem("booklite-accent", accent); } catch {}
}
