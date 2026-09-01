"use client";

import Button from "@/framework/ui/buttons/Button";
import Text from "@/framework/ui/iconText/Text";
import { border, colorSecondary, radiusBig, shadow } from "@/config/theme";
import type { Arrangement } from "@/lib/airsearcher/types";
import ResultCardClosed from "./ResultCardClosed";
import ResultCardOpen from "./ResultCardOpen";

/**
 * A result in the list. A thin switch between the two states, plus the controls
 * that belong to the list rather than to the card body.
 *
 * When the result has been floated its place in the list stays — so the
 * ordering never jumps — but goes inert: dimmed, with only "Bring back" live.
 */
export default function ResultCard({
  arrangement,
  cheapestPrice,
  open,
  floating,
  onToggle,
  onFloat,
  onUnfloat,
}: {
  arrangement: Arrangement;
  cheapestPrice: number;
  open: boolean;
  floating: boolean;
  onToggle: () => void;
  onFloat: () => void;
  onUnfloat: () => void;
}) {
  if (floating) {
    return (
      <article
        className={`flex items-center justify-between gap-3 bg-white ${border} ${radiusBig} p-4 opacity-50`}
      >
        <Text
          size="small"
          value="Floating — this result is open in a movable window"
          className={colorSecondary.text}
        />
        <Button styleType="tertiary" onClick={onUnfloat}>
          <Text size="small" value="Bring back" />
        </Button>
      </article>
    );
  }

  return (
    <article className={`flex flex-col gap-3 bg-white ${border} ${radiusBig} ${shadow} p-4`}>
      {open ? (
        <ResultCardOpen arrangement={arrangement} cheapestPrice={cheapestPrice} />
      ) : (
        <ResultCardClosed arrangement={arrangement} cheapestPrice={cheapestPrice} />
      )}

      <div className="flex items-center justify-between gap-2">
        <Button styleType="tertiary" onClick={onToggle}>
          <Text
            icon={open ? "chevron-up" : "chevron-down"}
            iconPosition="right"
            size="small"
            value={open ? "Close" : "Open"}
          />
        </Button>

        {/*
          Free positioning is meaningless on a phone, so floating is offered
          from `lg` up only.
        */}
        <Button styleType="tertiary" onClick={onFloat} className="hidden lg:inline-flex">
          <Text icon="upload" size="small" value="Float" />
        </Button>
      </div>
    </article>
  );
}
