"use client";

import { useCallback, useRef, useState } from "react";

type Handle = "low" | "high";

/**
 * Two-handle range slider, ported from the reference project and restyled with
 * the theme's colours.
 *
 * Uses pointer capture so a drag that leaves the track keeps tracking. The
 * handles cannot cross: the low handle clamps to the high value and vice versa.
 */
export default function DualRange({
  min,
  max,
  step = 1,
  value,
  onChange,
  formatValue,
  ariaLabel,
}: {
  min: number;
  max: number;
  step?: number;
  value: [number, number];
  onChange: (next: [number, number]) => void;
  formatValue?: (v: number) => string;
  ariaLabel: string;
}) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState<Handle | null>(null);

  const format = formatValue ?? ((v: number) => String(v));
  const span = max - min;
  const pct = (v: number) => (span === 0 ? 0 : ((v - min) / span) * 100);

  const quantise = useCallback(
    (raw: number) => {
      const stepped = Math.round(raw / step) * step;
      return Math.min(Math.max(stepped, min), max);
    },
    [min, max, step],
  );

  const valueFromPointer = useCallback(
    (clientX: number): number | null => {
      const rect = trackRef.current?.getBoundingClientRect();
      if (!rect || rect.width === 0) return null;
      const ratio = (clientX - rect.left) / rect.width;
      return quantise(min + ratio * span);
    },
    [min, span, quantise],
  );

  const applyTo = useCallback(
    (handle: Handle, next: number) => {
      if (handle === "low") onChange([Math.min(next, value[1]), value[1]]);
      else onChange([value[0], Math.max(next, value[0])]);
    },
    [onChange, value],
  );

  const nearestHandle = (next: number): Handle =>
    Math.abs(next - value[0]) <= Math.abs(next - value[1]) ? "low" : "high";

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const next = valueFromPointer(event.clientX);
    if (next === null) return;
    const handle = nearestHandle(next);
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(handle);
    applyTo(handle, next);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    const next = valueFromPointer(event.clientX);
    if (next !== null) applyTo(dragging, next);
  };

  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setDragging(null);
  };

  const onKey = (handle: Handle) => (event: React.KeyboardEvent) => {
    const delta =
      event.key === "ArrowLeft" || event.key === "ArrowDown"
        ? -step
        : event.key === "ArrowRight" || event.key === "ArrowUp"
          ? step
          : 0;
    if (delta === 0) return;
    event.preventDefault();
    applyTo(handle, quantise((handle === "low" ? value[0] : value[1]) + delta));
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div
        ref={trackRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        aria-label={ariaLabel}
        className="relative h-6 cursor-pointer touch-none select-none"
      >
        <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-gray-200" />
        <div
          className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-blue-600"
          style={{ left: `${pct(value[0])}%`, right: `${100 - pct(value[1])}%` }}
        />

        {(["low", "high"] as Handle[]).map((handle) => {
          const v = handle === "low" ? value[0] : value[1];
          return (
            <div
              key={handle}
              role="slider"
              tabIndex={0}
              aria-label={`${ariaLabel} ${handle === "low" ? "minimum" : "maximum"}`}
              aria-valuemin={min}
              aria-valuemax={max}
              aria-valuenow={v}
              aria-valuetext={format(v)}
              onKeyDown={onKey(handle)}
              style={{ left: `${pct(v)}%` }}
              className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-blue-600 bg-white shadow-sm"
            />
          );
        })}
      </div>

      <div className="flex justify-between">
        <span className="text-xs tabular-nums text-gray-500">{format(value[0])}</span>
        <span className="text-xs tabular-nums text-gray-500">{format(value[1])}</span>
      </div>
    </div>
  );
}
