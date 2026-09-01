"use client";

import { useEffect } from "react";
import Button from "@/framework/ui/buttons/Button";
import Text from "@/framework/ui/iconText/Text";
import { grayMid, radiusBig } from "@/config/theme";

/**
 * A wide centred dialog.
 *
 * The framework's `FixedModal` is the right component for ordinary dialogs and
 * is used for those (cost confirmation, the mobile flight list). It caps its
 * body at `max-w-md`, which the calendar and the map cannot work inside, so
 * those two get this component instead — same behaviour, sized for content.
 * Full-viewport on mobile, an inset panel on desktop.
 */
export default function Dialog({
  open,
  onClose,
  title,
  subtitle,
  width = "max-w-3xl",
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  /** Tailwind max-width class for the desktop panel. */
  width?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-stretch justify-center bg-black/40 sm:items-center sm:p-6"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
        className={`flex h-full w-full flex-col overflow-hidden bg-white shadow-xl ${radiusBig} sm:h-auto sm:max-h-[90vh] ${width}`}
      >
        <header
          className={`flex shrink-0 items-start justify-between gap-4 border-b ${grayMid.border} px-4 py-3 sm:px-6 sm:py-4`}
        >
          <div className="flex min-w-0 flex-col gap-0.5">
            <Text size="medium" value={title} className="font-semibold text-gray-900" />
            {subtitle && (
              <Text size="very small" value={subtitle} className="text-gray-500" />
            )}
          </div>
          <Button styleType="tertiary" onClick={onClose} className="shrink-0">
            <Text icon="close" size="small" />
            <span className="sr-only">Close</span>
          </Button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">{children}</div>

        {footer && (
          <footer
            className={`flex shrink-0 flex-wrap items-center justify-between gap-3 border-t ${grayMid.border} px-4 py-3 sm:px-6`}
          >
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
}
