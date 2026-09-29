"use client";

import { useState } from "react";
import Button from "@/framework/ui/buttons/Button";
import Text from "@/framework/ui/iconText/Text";
import { grayMid } from "@/config/theme";

/**
 * A collapsible titled section of the filter sidebar.
 *
 * The count on the right is how many results survive this group, shown so
 * narrowing is never a surprise. `topRight` carries the scope dropdown on a
 * round trip. `onReset`, passed only while the section differs from its
 * defaults, puts a reset icon at the top left that restores just this section.
 */
export default function FilterGroup({
  title,
  count,
  defaultOpen = false,
  topRight,
  onReset,
  children,
}: {
  title: string;
  count?: number;
  defaultOpen?: boolean;
  topRight?: React.ReactNode;
  onReset?: () => void;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className={`border-b ${grayMid.border} py-3 last:border-b-0`}>
      <div className="flex items-center justify-between gap-2">
        {onReset && (
          <Button
            styleType="tertiary"
            onClick={onReset}
            className="shrink-0 bg-transparent! p-1!"
          >
            <Text icon="reset" size="very small" className="text-gray-500" />
            <span className="sr-only">Reset {title}</span>
          </Button>
        )}
        <Button
          styleType="tertiary"
          onClick={() => setOpen((v) => !v)}
          className="min-w-0 flex-1 justify-start! gap-2 bg-transparent! px-0! py-0! hover:bg-transparent!"
        >
          <Text
            size="small"
            value={title}
            className="truncate font-semibold text-gray-900"
          />
          {count !== undefined && (
            <Text size="very small" value={`(${count})`} className="text-gray-400" />
          )}
        </Button>

        {/* The scope dropdown sits before the section's one open/close arrow. */}
        {topRight}

        <Button
          styleType="tertiary"
          onClick={() => setOpen((v) => !v)}
          className="shrink-0 bg-transparent! px-0! py-0! hover:bg-transparent!"
        >
          <Text icon={open ? "chevron-up" : "chevron-down"} size="very small" className="text-gray-400" />
          <span className="sr-only">{open ? `Close ${title}` : `Open ${title}`}</span>
        </Button>
      </div>

      {open && <div className="mt-3 flex flex-col gap-3">{children}</div>}
    </div>
  );
}
