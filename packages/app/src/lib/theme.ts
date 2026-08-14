/**
 * App chrome theme — shared by General settings and Reading background picker.
 * Stored in localStorage as `readany-theme`, applied via documentElement `data-theme`.
 */

import type { ReaderBackgroundId } from "@readany/core/types";

export type ThemeMode = "light" | "dark" | "sepia" | "green" | "system";

export const THEME_STORAGE_KEY = "readany-theme";
export const THEME_CHANGE_EVENT = "readany-theme-change";

const THEME_MODES: ThemeMode[] = ["light", "dark", "sepia", "green", "system"];

export function isThemeMode(value: unknown): value is ThemeMode {
  return typeof value === "string" && (THEME_MODES as string[]).includes(value);
}

/** Effective data-theme attribute (never "system"). */
export type AppliedTheme = Exclude<ThemeMode, "system">;

export function resolveAppliedTheme(mode: ThemeMode): AppliedTheme {
  if (mode === "system") {
    if (typeof window === "undefined") return "light";
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return mode;
}

export function getStoredThemeMode(): ThemeMode {
  if (typeof localStorage === "undefined") return "sepia";
  const saved = localStorage.getItem(THEME_STORAGE_KEY);
  if (isThemeMode(saved)) return saved;
  return "sepia";
}

/**
 * Reading background swatches ↔ app theme modes (1:1).
 * auto ↔ system; green is a first-class app theme.
 */
export function themeModeFromReaderBackground(id: ReaderBackgroundId): ThemeMode {
  switch (id) {
    case "auto":
      return "system";
    case "light":
      return "light";
    case "sepia":
      return "sepia";
    case "green":
      return "green";
    case "dark":
      return "dark";
    default:
      return "system";
  }
}

export function readerBackgroundFromThemeMode(mode: ThemeMode): ReaderBackgroundId {
  switch (mode) {
    case "system":
      return "auto";
    case "light":
      return "light";
    case "sepia":
      return "sepia";
    case "green":
      return "green";
    case "dark":
      return "dark";
    default:
      return "auto";
  }
}

/** Apply theme to document + persist. Notifies listeners via CustomEvent. */
export function applyTheme(mode: ThemeMode): void {
  if (typeof document === "undefined") return;
  localStorage.setItem(THEME_STORAGE_KEY, mode);
  document.documentElement.setAttribute("data-theme", resolveAppliedTheme(mode));
  window.dispatchEvent(new CustomEvent(THEME_CHANGE_EVENT, { detail: mode }));
}

/** Restore theme on app boot (main.tsx). */
export function restoreThemeOnBoot(): void {
  applyTheme(getStoredThemeMode());
}
