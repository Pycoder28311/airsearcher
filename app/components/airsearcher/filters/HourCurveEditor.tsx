"use client";

import { useCallback, useRef, useState } from "react";
import Text from "@/framework/ui/iconText/Text";
import { grayMid, radius } from "@/config/theme";
import type { HourCurve } from "@/lib/airsearcher/config/ranking";

const GRAPH_HEIGHT_PX = 120;

/** Hours per bar: the curve keeps one value per hour, edited three at a time. */
const HOURS_PER_BAR = 3;
const BARS = 24 / HOURS_PER_BAR;

function clamp(value: number): number {
  return Math.min(Math.max(Math.round(value), 0), 100);
}

/** "06–09": the hours a bar covers. */
function barLabel(bar: number): string {
  const pad = (hour: number) => String(hour).padStart(2, "0");
  return `${pad(bar * HOURS_PER_BAR)}–${pad((bar + 1) * HOURS_PER_BAR)}`;
}

/**
 * The hour preference curve, ported from the reference project, drawn as 8
 * bars of 3 hours each.
 *
 * Drag across it to paint: 100 means "ideal time to fly", 0 means "avoid".
 * Painting a bar sets all three of its hours, so the ranking still reads one
 * value per hour. A bar shows its hours' average, which is what an older
 * hour-by-hour curve looks like at this coarser scale.
 * Pointer capture keeps a drag alive when it leaves the element.
 */
export default function HourCurveEditor({
  value,
  onChange,
  label,
  note,
}: {
  value: HourCurve;
  onChange: (next: HourCurve) => void;
  label: string;
  note?: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const [activeBar, setActiveBar] = useState<number | null>(null);

  const bars = Array.from({ length: BARS }, (_, bar) => {
    const hours = value.slice(bar * HOURS_PER_BAR, (bar + 1) * HOURS_PER_BAR);
    return Math.round(hours.reduce((sum, level) => sum + level, 0) / hours.length);
  });

  const setBar = useCallback(
    (bar: number, next: number) => {
      if (bar < 0 || bar >= BARS) return;
      const updated = [...value];
      for (let hour = bar * HOURS_PER_BAR; hour < (bar + 1) * HOURS_PER_BAR; hour++) {
        updated[hour] = clamp(next);
      }
      onChange(updated);
    },
    [value, onChange],
  );

  const paint = useCallback(
    (clientX: number, clientY: number) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect || rect.width === 0 || rect.height === 0) return;

      const bar = Math.floor(((clientX - rect.left) / rect.width) * BARS);
      const level = (1 - (clientY - rect.top) / rect.height) * 100;

      setActiveBar(Math.min(Math.max(bar, 0), BARS - 1));
      setBar(bar, level);
    },
    [setBar],
  );

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <Text size="very small" value={label} className="text-gray-600" />
        {activeBar !== null && (
          <Text
            size="very small"
            value={`${barLabel(activeBar)} · ${bars[activeBar]}`}
            className="tabular-nums text-gray-400"
          />
        )}
      </div>

      <div
        ref={containerRef}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          setDragging(true);
          paint(event.clientX, event.clientY);
        }}
        onPointerMove={(event) => {
          if (dragging) paint(event.clientX, event.clientY);
        }}
        onPointerUp={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
          }
          setDragging(false);
          setActiveBar(null);
        }}
        style={{ height: GRAPH_HEIGHT_PX }}
        className={`flex cursor-crosshair touch-none items-end gap-px ${radius} border ${grayMid.border} bg-white p-1`}
      >
        {bars.map((level, bar) => (
          <div
            key={bar}
            title={`${barLabel(bar)} · ${level}`}
            style={{ height: `${Math.max(2, level)}%` }}
            className={`flex-1 rounded-sm ${
              bar === activeBar ? "bg-orange-500" : "bg-blue-500/70"
            }`}
          />
        ))}
      </div>

      {/* Each bar's first hour under it, spaced like the bars (the p-1 inset included). */}
      <div className="flex gap-px px-1">
        {bars.map((_, bar) => (
          <Text
            key={bar}
            size="very small"
            value={String(bar * HOURS_PER_BAR).padStart(2, "0")}
            className="flex-1 text-center text-gray-400 tabular-nums"
          />
        ))}
      </div>

      {note && <Text size="very small" value={note} className="text-gray-400" />}
    </div>
  );
}
