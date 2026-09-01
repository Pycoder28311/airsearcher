"use client";

import { useRef } from "react";
import Button from "@/framework/ui/buttons/Button";
import Text from "@/framework/ui/iconText/Text";
import { border, grayLight, grayMid, radiusBig } from "@/config/theme";
import { CURRENCY } from "@/lib/airsearcher/config/constants";
import type { Arrangement } from "@/lib/airsearcher/types";
import type { FloatingBox } from "./useFloatingWindows";
import ResultCardOpen from "./ResultCardOpen";

/**
 * One floating result: draggable by its header, resizable from its corner.
 *
 * Pointer events rather than HTML5 drag, with `setPointerCapture` so a fast
 * drag cannot outrun the handle and drop the window mid-gesture.
 */
export default function FloatingWindow({
  arrangement,
  cheapestPrice,
  box,
  onMove,
  onResize,
  onFocus,
  onClose,
}: {
  arrangement: Arrangement;
  cheapestPrice: number;
  box: FloatingBox;
  onMove: (x: number, y: number) => void;
  onResize: (width: number, height: number) => void;
  onFocus: () => void;
  onClose: () => void;
}) {
  const dragOffset = useRef({ x: 0, y: 0 });
  const resizeStart = useRef({ x: 0, y: 0, width: 0, height: 0 });

  const startDrag = (event: React.PointerEvent) => {
    onFocus();
    dragOffset.current = { x: event.clientX - box.x, y: event.clientY - box.y };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onDrag = (event: React.PointerEvent) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    onMove(event.clientX - dragOffset.current.x, event.clientY - dragOffset.current.y);
  };

  const startResize = (event: React.PointerEvent) => {
    onFocus();
    resizeStart.current = {
      x: event.clientX,
      y: event.clientY,
      width: box.width,
      height: box.height,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.stopPropagation();
  };

  const onResizeMove = (event: React.PointerEvent) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    onResize(
      resizeStart.current.width + (event.clientX - resizeStart.current.x),
      resizeStart.current.height + (event.clientY - resizeStart.current.y),
    );
  };

  return (
    <div
      onPointerDown={onFocus}
      style={{
        left: box.x,
        top: box.y,
        width: box.width,
        height: box.height,
        zIndex: box.z,
      }}
      className={`pointer-events-auto absolute flex flex-col overflow-hidden bg-white ${border} ${radiusBig} shadow-xl`}
    >
      <header
        onPointerDown={startDrag}
        onPointerMove={onDrag}
        className={`flex shrink-0 cursor-grab items-center justify-between gap-2 border-b ${grayMid.border} ${grayLight.bg} px-3 py-2 active:cursor-grabbing`}
      >
        <div className="flex min-w-0 flex-col">
          <Text
            size="small"
            value={`${arrangement.totals.totalPrice} ${CURRENCY}`}
            className="font-semibold text-gray-900"
          />
          <Text
            size="very small"
            value={`${arrangement.destination.airport} · ${arrangement.departureDate}`}
            className="truncate text-gray-500"
          />
        </div>

        {/*
          The header captures the pointer to drive dragging, which would
          otherwise swallow this button's click. Stopping pointerdown here keeps
          the drag handle and the button from fighting over the same gesture.
        */}
        <span className="shrink-0" onPointerDown={(event) => event.stopPropagation()}>
          <Button styleType="tertiary" onClick={onClose}>
            <Text size="very small" value="Undrag" />
          </Button>
        </span>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <ResultCardOpen arrangement={arrangement} cheapestPrice={cheapestPrice} />
      </div>

      <div
        onPointerDown={startResize}
        onPointerMove={onResizeMove}
        role="separator"
        aria-label="Resize this result"
        className="absolute right-0 bottom-0 h-4 w-4 cursor-nwse-resize border-r-2 border-b-2 border-gray-300"
      />
    </div>
  );
}
