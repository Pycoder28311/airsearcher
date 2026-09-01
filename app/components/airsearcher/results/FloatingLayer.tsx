"use client";

import type { Arrangement } from "@/lib/airsearcher/types";
import FloatingWindow from "./FloatingWindow";
import type { FloatingBox } from "./useFloatingWindows";

/**
 * The layer the floating results live on.
 *
 * `pointer-events-none` so it never blocks the page; each window turns them
 * back on for itself. Desktop only — the float control is hidden below `lg`.
 */
export default function FloatingLayer({
  boxes,
  arrangements,
  cheapestPrice,
  onMove,
  onResize,
  onFocus,
  onClose,
}: {
  boxes: Record<string, FloatingBox>;
  arrangements: Arrangement[];
  cheapestPrice: number;
  onMove: (id: string, x: number, y: number) => void;
  onResize: (id: string, width: number, height: number) => void;
  onFocus: (id: string) => void;
  onClose: (id: string) => void;
}) {
  const entries = Object.entries(boxes);
  if (entries.length === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-40 hidden lg:block">
      {entries.map(([id, box]) => {
        const arrangement = arrangements.find((a) => a.id === id);
        if (!arrangement) return null;

        return (
          <FloatingWindow
            key={id}
            arrangement={arrangement}
            cheapestPrice={cheapestPrice}
            box={box}
            onMove={(x, y) => onMove(id, x, y)}
            onResize={(width, height) => onResize(id, width, height)}
            onFocus={() => onFocus(id)}
            onClose={() => onClose(id)}
          />
        );
      })}
    </div>
  );
}
