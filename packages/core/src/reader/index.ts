// Font themes
export { FONT_THEMES, DEFAULT_FONT_THEME, getFontTheme } from "./font-themes";

// Reader page background presets
export {
  READER_BACKGROUND_OPTIONS,
  READER_BACKGROUND_PRESETS,
  getReaderBackgroundSwatch,
  isReaderBackgroundId,
  resolveReaderBackgroundColors,
} from "./reader-background";
export type {
  AppChromeTheme,
  ReaderBackgroundColors,
  ReaderBackgroundId,
} from "./reader-background";

// Keyboard shortcuts
export { DEFAULT_BINDINGS, isInputElement, matchBinding, findAction } from "./keyboard";
export type { KeyBinding } from "./keyboard";

// Table of contents
export { getFirstTocHref } from "./toc";

// Pagination
export {
  getPageDirection,
  getScrollPageOffset,
  navigatePage,
  calculateProgress,
} from "./pagination";
export type { PageDirection } from "./pagination";

// Progress tracking
export { createProgressTracker, estimateTimeToFinish } from "./progress";
export type { ProgressData } from "./progress";

// Session detection
export { createSessionDetector } from "./session-detector";
export type { SessionEvent, SessionDetector } from "./session-detector";

// Annotation mutations
export { createSelectionNoteMutation } from "./selection-note";
export type { SelectionNoteMutation, SelectionNoteMutationInput } from "./selection-note";
export {
  compareAnnotationPosition,
  compareCfiPosition,
  sortAnnotationsByPosition,
} from "./annotation-order";
