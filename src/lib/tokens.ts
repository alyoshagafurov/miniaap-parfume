/**
 * The few design tokens that JavaScript needs as literal values.
 *
 * Telegram's setHeaderColor / setBackgroundColor / setBottomBarColor and Next's
 * viewport.themeColor all take a colour string, not a CSS custom property, so
 * these cannot be read from the stylesheet at those call sites. Neither can an
 * .xlsx: a spreadsheet cell's fill is a literal hex inside the file.
 *
 * src/app/globals.css remains the source of truth. tokens.test.ts parses it and
 * fails if these drift from it, so the duplication cannot rot silently.
 */

/** --color-canvas */
export const CANVAS = "#f8f5ee";

/** --color-surface */
export const SURFACE = "#fffdf8";

/** --color-olive */
export const OLIVE = "#4d522c";

/** --color-ink */
export const INK = "#23241e";

/** --color-olive-wash. Used for the header band of a generated spreadsheet. */
export const OLIVE_WASH = "#eceade";
