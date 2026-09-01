/**
 * Central design tokens for the whole project.
 *
 * Every value here is a Tailwind class-name string (not a CSS value), so it can
 * be dropped straight into a `className`. Import these tokens in the other style
 * config files instead of hardcoding utilities — change a value once here and it
 * propagates everywhere.
 *
 * ── Palette: light, Notion-like ───────────────────────────────────────────────
 * The project commits to a single light palette built on soft, low-contrast
 * neutrals — the Notion look: near-white surfaces, hairline borders, flat
 * shadows, and colour used sparingly for meaning rather than decoration.
 *
 *   • Neutrals  → the gray scale (grayLight / grayMid / grayStrong below)
 *   • Primary   → blue   (colorMain)      — actions, focus, links
 *   • Secondary → orange (colorSecondary) — highlights, selection, warnings
 *
 * `next-themes` is still installed and `app/globals.css` still defines the
 * `dark` / `ocean` / `forest` / `sunset` classes, but this palette is not tuned
 * for them: the tokens below are chosen to look right in the default light
 * theme. Nothing here reads a theme value through React — theming remains pure
 * CSS.
 *
 * NOTE for Tailwind: all class names are written here as complete literal
 * strings (never built dynamically like `bg-${c}-500`) so Tailwind's source
 * scanner detects them and generates the CSS, even though they're consumed via
 * interpolation in the other config files.
 */

/* ── Radius ──────────────────────────────────────────────────────────────── */
export const radius = "rounded-lg"; // default corner radius (buttons, inputs)
export const radiusBig = "rounded-2xl"; // large radius (cards, big search, modals)

/* ── Padding ─────────────────────────────────────────────────────────────── */
export const paddingSmall = "px-3 py-1.5"; // compact controls
export const paddingBig = "px-5 py-3"; // roomy controls

/* ── Border & shadow ─────────────────────────────────────────────────────── */
// Notion borders are hairlines — one step lighter than the old gray-300.
export const border = "border border-gray-200";
export const shadow = "shadow-sm";

/* ── Colour token shape ──────────────────────────────────────────────────────
 * Each colour exposes the same keys so call sites can compose them uniformly:
 *   bg / bgHover / bgActive → solid fill plus its hover + clicked (:active) state
 *   text                    → text / icon colour
 *   border                  → border colour
 *   ring                    → focus-visible ring (used on buttons)
 *   focusBorder / focusRing → input focus border + soft ring
 */
export type ColorToken = {
  bg: string;
  bgHover: string;
  bgActive: string;
  text: string;
  border: string;
  ring: string;
  focusBorder: string;
  focusRing: string;
};

/** Main brand accent — blue. Actions, focus rings, links. */
export const colorMain: ColorToken = {
  bg: "bg-blue-600",
  bgHover: "hover:bg-blue-700",
  bgActive: "active:bg-blue-800",
  text: "text-blue-600",
  border: "border-blue-500",
  ring: "focus-visible:ring-blue-500",
  focusBorder: "focus:border-blue-500",
  focusRing: "focus:ring-2 focus:ring-blue-500/25",
};

/** Secondary brand accent — orange. Highlights, selection, soft warnings. */
export const colorSecondary: ColorToken = {
  bg: "bg-orange-500",
  bgHover: "hover:bg-orange-600",
  bgActive: "active:bg-orange-700",
  text: "text-orange-600",
  border: "border-orange-500",
  ring: "focus-visible:ring-orange-500",
  focusBorder: "focus:border-orange-500",
  focusRing: "focus:ring-2 focus:ring-orange-500/25",
};

/**
 * Colour of the "primaries" — the solid neutral fill used by primary/solid
 * buttons. Notion's committing action is near-black on white.
 */
export const colorPrimaries: ColorToken = {
  bg: "bg-gray-900",
  bgHover: "hover:bg-black",
  bgActive: "active:bg-black",
  text: "text-white",
  border: "border-gray-900",
  ring: "focus-visible:ring-gray-400",
  focusBorder: "focus:border-gray-700",
  focusRing: "focus:ring-2 focus:ring-gray-400/30",
};

/** Global danger / red colour. */
export const colorRed: ColorToken = {
  bg: "bg-red-600",
  bgHover: "hover:bg-red-700",
  bgActive: "active:bg-red-800",
  text: "text-red-600",
  border: "border-red-300",
  ring: "focus-visible:ring-red-500",
  focusBorder: "focus:border-red-500",
  focusRing: "focus:ring-2 focus:ring-red-500/25",
};

/* ── Gray shades (3) — the Notion neutral scale ──────────────────────────────
 * grayLight  → surfaces / subtle fills      (gray-50)
 * grayMid    → borders / dividers           (gray-200)
 * grayStrong → muted text / strong elements (gray-600)
 */
export type GrayToken = {
  bg: string;
  bgHover: string;
  bgActive: string;
  text: string;
  border: string;
  borderHover: string;
};

export const grayLight: GrayToken = {
  bg: "bg-gray-50",
  bgHover: "hover:bg-gray-100",
  bgActive: "active:bg-gray-200",
  text: "text-gray-50",
  border: "border-gray-50",
  borderHover: "hover:border-gray-100",
};

export const grayMid: GrayToken = {
  bg: "bg-gray-200",
  bgHover: "hover:bg-gray-300",
  bgActive: "active:bg-gray-400",
  text: "text-gray-400",
  border: "border-gray-200",
  borderHover: "hover:border-gray-300",
};

export const grayStrong: GrayToken = {
  bg: "bg-gray-600",
  bgHover: "hover:bg-gray-700",
  bgActive: "active:bg-gray-800",
  text: "text-gray-600",
  border: "border-gray-600",
  borderHover: "hover:border-gray-700",
};

/* ── Convenience bundle ──────────────────────────────────────────────────── */
const theme = {
  radius,
  radiusBig,
  paddingSmall,
  paddingBig,
  border,
  shadow,
  colorMain,
  colorSecondary,
  colorPrimaries,
  colorRed,
  grayLight,
  grayMid,
  grayStrong,
};

export default theme;
