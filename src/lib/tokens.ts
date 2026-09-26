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
export const CANVAS = "#f2f2f0";

/** --color-surface */
export const SURFACE = "#ffffff";

/** --color-primary. Graphite: buttons and active states. */
export const PRIMARY = "#1e1e1c";

/** --color-ink */
export const INK = "#1b1b1a";

/** --color-primary-wash. Used for the header band of a generated spreadsheet. */
export const PRIMARY_WASH = "#e8e8e5";
