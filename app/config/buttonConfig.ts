import { radius, colorMain, colorPrimaries, colorRed, grayLight } from "./theme";

export const BUTTON_VARIANTS = [
  "primary",
  "secondary",
  "tertiary",
  "tertiary-bordered",
  "underline",
  "delete",
  "nav",
] as const;

export type ButtonVariant = (typeof BUTTON_VARIANTS)[number];

/** Shared layout/typography/focus styles applied to every button variant. */
export const baseStyles =
  `inline-flex items-center justify-center px-4 py-2 ${radius} text-sm font-medium select-none transition-all duration-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2`;

export type VariantStyle = {
  /** Always-applied base appearance. */
  base: string;
  /** Applied on hover. */
  hover: string;
  /** Applied while pressed (onClick / :active). */
  active: string;
  /** Applied when disabled. */
  disabled: string;
};

export const variantStyles: Record<ButtonVariant, VariantStyle> = {
  // Flat solid button: darker on hover and while pressed.
  primary: {
    base: `${colorMain.bg} text-white ${colorMain.ring}`,
    hover: colorMain.bgHover,
    active: colorMain.bgActive,
    disabled: "disabled:opacity-50 disabled:cursor-not-allowed",
  },
  // Solid colored-fill button.
  secondary: {
    base: `${colorPrimaries.bg} ${colorPrimaries.text} ${colorPrimaries.ring}`,
    hover: colorPrimaries.bgHover,
    active: colorPrimaries.bgActive,
    disabled: "disabled:opacity-50 disabled:cursor-not-allowed",
  },
  // Light, subtle filled button (the former "secondary").
  tertiary: {
    base: `${grayLight.bg} text-gray-900 focus-visible:ring-gray-400`,
    hover: grayLight.bgHover,
    active: grayLight.bgActive,
    disabled: "disabled:opacity-50 disabled:cursor-not-allowed",
  },
  // No background; an animated multi-color gradient spins around the border.
  "tertiary-bordered": {
    base: "btn-spin-border text-gray-900 focus-visible:ring-gray-400",
    hover: "",
    active: "",
    disabled: "disabled:opacity-50 disabled:cursor-not-allowed",
  },
  // Text-only button (no padding); an underline wipes in left to right on hover.
  underline: {
    base: `relative px-0! py-0! bg-transparent ${colorMain.text} after:absolute after:-bottom-0.5 after:left-0 after:h-[2px] after:w-full after:origin-left after:scale-x-0 after:bg-current after:transition-transform after:duration-300 after:content-['']`,
    hover: "hover:after:scale-x-100",
    active: "",
    disabled: "disabled:opacity-50 disabled:cursor-not-allowed",
  },
  delete: {
    base: `${colorRed.bg} text-white ${colorRed.ring}`,
    hover: colorRed.bgHover,
    active: colorRed.bgActive,
    disabled: "disabled:opacity-50 disabled:cursor-not-allowed",
  },
  // Navbar link style: transparent, gray text that darkens on hover.
 nav: {
  base: "relative bg-transparent text-gray-600 py-2 transition-all duration-200 focus-visible:ring-gray-400",
  hover: "hover:text-gray-900 hover:bg-gray-50 after:absolute after:left-3 after:right-3 after:bottom-0 after:h-0.5 after:bg-green-500 after:scale-x-0 hover:after:scale-x-100 after:transition-transform after:duration-200",
  active: "text-gray-900 bg-gray-50 after:absolute after:left-3 after:right-3 after:bottom-0 after:h-0.5 after:bg-green-500",
  disabled: "disabled:opacity-50 disabled:cursor-not-allowed",
},
};
