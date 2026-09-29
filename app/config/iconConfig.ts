import type { IconType } from "react-icons";
import type { TextSize } from "@/config/textConfig";
import {
  FiHome,
  FiSearch,
  FiUser,
  FiSettings,
  FiBell,
  FiMail,
  FiHeart,
  FiStar,
  FiCheck,
  FiX,
  FiPlus,
  FiTrash2,
  FiEdit2,
  FiArrowRight,
  FiArrowLeft,
  FiChevronDown,
  FiChevronUp,
  FiChevronRight,
  FiDownload,
  FiUpload,
  FiCalendar,
  FiClock,
  FiInfo,
  FiAlertCircle,
  FiLock,
  FiLogOut,
  FiGrid,
  FiFolder,
  FiCheckSquare,
  FiMessageSquare,
  FiBarChart2,
  FiHelpCircle,
  FiDroplet,
  FiExternalLink,
} from "react-icons/fi";
import { LuPlane } from "react-icons/lu";

/** String name -> react-icons component. Add more entries as needed. */
export const ICONS = {
  home: FiHome,
  search: FiSearch,
  user: FiUser,
  settings: FiSettings,
  bell: FiBell,
  mail: FiMail,
  heart: FiHeart,
  star: FiStar,
  check: FiCheck,
  close: FiX,
  plus: FiPlus,
  trash: FiTrash2,
  edit: FiEdit2,
  "arrow-right": FiArrowRight,
  "arrow-left": FiArrowLeft,
  "chevron-down": FiChevronDown,
  "chevron-up": FiChevronUp,
  "chevron-right": FiChevronRight,
  download: FiDownload,
  upload: FiUpload,
  calendar: FiCalendar,
  clock: FiClock,
  info: FiInfo,
  alert: FiAlertCircle,
  lock: FiLock,
  logout: FiLogOut,
  dashboard: FiGrid,
  folder: FiFolder,
  tasks: FiCheckSquare,
  messages: FiMessageSquare,
  analytics: FiBarChart2,
  help: FiHelpCircle,
  palette: FiDroplet,
  plane: LuPlane,
  "external-link": FiExternalLink,
} satisfies Record<string, IconType>;

export type IconName = keyof typeof ICONS;

/** Re-exported so the IconText component pulls sizing types from one place. */
export type { TextSize } from "@/config/textConfig";

/**
 * Responsive sizing per size key, reusing the text size scale.
 * `icon` -> explicit w/h classes (overrides react-icons' default 1em).
 * `font` -> matching font-size classes for the accompanying text.
 * Both are mobile-first: base = phone, sm/md/lg grow on wider screens, so
 * the icon size is relative to the mobile size and to the font size.
 */
export const iconSizeStyles: Record<TextSize, { icon: string; font: string }> = {
  "very small": {
    icon: "w-3 h-3 sm:w-3.5 sm:h-3.5",
    font: "text-[0.625rem] sm:text-xs",
  },
  small: {
    icon: "w-4 h-4 sm:w-5 sm:h-5",
    font: "text-xs sm:text-sm",
  },
  medium: {
    icon: "w-5 h-5 sm:w-6 sm:h-6 md:w-7 md:h-7",
    font: "text-sm sm:text-base md:text-lg",
  },
  big: {
    icon: "w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8",
    font: "text-lg sm:text-xl md:text-2xl",
  },
  large: {
    icon: "w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12",
    font: "text-2xl sm:text-3xl md:text-4xl lg:text-5xl",
  },
};
