/**
 * Reader page background presets (content area colors).
 * Distinct from app chrome theme — can follow app ("auto") or force a paper color.
 */

export type ReaderBackgroundId = "auto" | "light" | "sepia" | "green" | "dark";

export interface ReaderBackgroundColors {
  bg: string;
  fg: string;
  link: string;
}

/** Fixed paper palettes used by the reader content surface. */
export const READER_BACKGROUND_PRESETS: Record<
  Exclude<ReaderBackgroundId, "auto">,
  ReaderBackgroundColors
> = {
  light: { bg: "#ffffff", fg: "#1a1a1a", link: "#2563eb" },
  sepia: { bg: "#f0e6d2", fg: "#3d2b1f", link: "#6b4c2a" },
  green: { bg: "#c7edcc", fg: "#1a2e1a", link: "#166534" },
  dark: { bg: "#121212", fg: "#e8e8e8", link: "#60a5fa" },
};

/** App chrome themes that map 1:1 to reader paper colors when background is "auto". */
export type AppChromeTheme = "light" | "dark" | "sepia" | "green";

const APP_THEME_TO_PAPER: Record<AppChromeTheme, Exclude<ReaderBackgroundId, "auto">> = {
  light: "light",
  dark: "dark",
  sepia: "sepia",
  green: "green",
};

export const READER_BACKGROUND_OPTIONS: ReaderBackgroundId[] = [
  "auto",
  "light",
  "sepia",
  "green",
  "dark",
];

export function isReaderBackgroundId(value: unknown): value is ReaderBackgroundId {
  return (
    value === "auto" ||
    value === "light" ||
    value === "sepia" ||
    value === "green" ||
    value === "dark"
  );
}

/**
 * Resolve effective page colors for the reader content area.
 * @param preset from readSettings.readerBackground (default auto)
 * @param appTheme current app chrome theme when preset is auto
 */
export function resolveReaderBackgroundColors(
  preset: ReaderBackgroundId | undefined,
  appTheme: AppChromeTheme | string | null | undefined,
): ReaderBackgroundColors {
  const id = isReaderBackgroundId(preset) ? preset : "auto";
  if (id !== "auto") {
    return READER_BACKGROUND_PRESETS[id];
  }
  const mapped =
    appTheme && appTheme in APP_THEME_TO_PAPER
      ? APP_THEME_TO_PAPER[appTheme as AppChromeTheme]
      : "dark";
  return READER_BACKGROUND_PRESETS[mapped];
}

/** Swatch color shown in settings UI (auto uses a gradient hint via UI). */
export function getReaderBackgroundSwatch(id: ReaderBackgroundId): string {
  if (id === "auto") return "linear-gradient(135deg, #ffffff 0%, #f0e6d2 50%, #121212 100%)";
  return READER_BACKGROUND_PRESETS[id].bg;
}
