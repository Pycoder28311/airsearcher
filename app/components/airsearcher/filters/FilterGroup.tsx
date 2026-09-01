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
 * round trip.
 */
export default function FilterGroup({
  title,
  count,
  defaultOpen = false,
  topRight,
  children,
}: {
  title: string;
  count?: number;
  defaultOpen?: boolean;
  topRight?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className={`border-b ${grayMid.border} py-3 last:border-b-0`}>
      <div className="flex items-center justify-between gap-2">
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
          <Text
            icon={open ? "chevron-up" : "chevron-down"}
            size="very small"
            className="ml-auto text-gray-400"
          />
        </Button>

        {topRight}
      </div>

      {open && <div className="mt-3 flex flex-col gap-3">{children}</div>}
    </div>
  );
}
