"use client";

import { useCallback, useRef, useState } from "react";
import Text from "@/framework/ui/iconText/Text";
import { grayMid, radius } from "@/config/theme";
import type { HourCurve } from "@/lib/airsearcher/config/ranking";

const GRAPH_HEIGHT_PX = 120;

function clamp(value: number): number {
  return Math.min(Math.max(Math.round(value), 0), 100);
}

/**
 * The 24-bar hour preference curve, ported from the reference project.
 *
 * Drag across it to paint: 100 means "ideal time to fly", 0 means "avoid".
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
  const [activeHour, setActiveHour] = useState<number | null>(null);

  const setHour = useCallback(
    (hour: number, next: number) => {
      if (hour < 0 || hour > 23) return;
      const updated = [...value];
      updated[hour] = clamp(next);
      onChange(updated);
    },
    [value, onChange],
  );

  const paint = useCallback(
    (clientX: number, clientY: number) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect || rect.width === 0 || rect.height === 0) return;

      const hour = Math.floor(((clientX - rect.left) / rect.width) * 24);
      const level = (1 - (clientY - rect.top) / rect.height) * 100;

      setActiveHour(Math.min(Math.max(hour, 0), 23));
      setHour(hour, level);
    },
    [setHour],
  );

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <Text size="very small" value={label} className="text-gray-600" />
        {activeHour !== null && (
          <Text
            size="very small"
            value={`${String(activeHour).padStart(2, "0")}:00 · ${value[activeHour]}`}
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
          setActiveHour(null);
        }}
        style={{ height: GRAPH_HEIGHT_PX }}
        className={`flex cursor-crosshair touch-none items-end gap-px ${radius} border ${grayMid.border} bg-white p-1`}
      >
        {value.map((level, hour) => (
          <div
            key={hour}
            style={{ height: `${Math.max(2, level)}%` }}
            className={`flex-1 rounded-sm ${
              hour === activeHour ? "bg-orange-500" : "bg-blue-500/70"
            }`}
          />
        ))}
      </div>

      <div className="flex justify-between">
        {["00", "06", "12", "18", "23"].map((hour) => (
          <Text key={hour} size="very small" value={hour} className="text-gray-400" />
        ))}
      </div>

      {note && <Text size="very small" value={note} className="text-gray-400" />}
    </div>
  );
}
