/**
 * Utilitários para otimização mobile
 */

/**
 * Classes CSS para botões touch-friendly (mínimo 44px de altura)
 */
export const MOBILE_BUTTON_CLASSES = "min-h-[44px] touch-manipulation";

/**
 * Classes CSS para inputs touch-friendly
 */
export const MOBILE_INPUT_CLASSES = "h-11 touch-manipulation";

/**
 * Classes CSS para cards mobile
 */
export const MOBILE_CARD_CLASSES = "p-4 sm:p-6";

/**
 * Classes CSS para espaçamento responsivo
 */
export const MOBILE_SPACING = {
  container: "px-4 sm:px-6 py-4 sm:py-6",
  section: "mb-4 sm:mb-6",
  gap: "gap-3 sm:gap-4",
};

/**
 * Breakpoints Tailwind
 */
export const BREAKPOINTS = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
};

/**
 * Detecta se está em dispositivo móvel
 */
export function isMobileDevice(): boolean {
  if (typeof window === "undefined") return false;
  return window.innerWidth < BREAKPOINTS.md;
}

/**
 * Detecta se é touch device
 */
export function isTouchDevice(): boolean {
  if (typeof window === "undefined") return false;
  return "ontouchstart" in window || navigator.maxTouchPoints > 0;
}
