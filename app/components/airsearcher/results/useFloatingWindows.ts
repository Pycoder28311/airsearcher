"use client";

import { useCallback, useRef, useState } from "react";
import {
  DEFAULT_FLOAT_HEIGHT,
  DEFAULT_FLOAT_WIDTH,
  FLOAT_CASCADE_OFFSET,
  MIN_FLOAT_HEIGHT,
  MIN_FLOAT_WIDTH,
} from "@/lib/airsearcher/config/constants";

export interface FloatingBox {
  x: number;
  y: number;
  width: number;
  height: number;
  z: number;
}

/**
 * Position, size and stacking order for the floating result windows.
 *
 * Kept out of the components so dragging, resizing and z-order are one small
 * state machine rather than three tangled ones.
 */
export function useFloatingWindows() {
  const [boxes, setBoxes] = useState<Record<string, FloatingBox>>({});
  // A counter, never rendered — a ref keeps it out of the render cycle.
  const topZ = useRef(1);

  const ids = Object.keys(boxes);

  const clamp = (box: FloatingBox): FloatingBox => {
    if (typeof window === "undefined") return box;
    const maxX = Math.max(0, window.innerWidth - 80);
    const maxY = Math.max(0, window.innerHeight - 60);
    return {
      ...box,
      x: Math.min(Math.max(box.x, -box.width + 120), maxX),
      y: Math.min(Math.max(box.y, 0), maxY),
    };
  };

  /** Opens a window, cascading it clear of the ones already on screen. */
  const open = useCallback(
    (id: string) => {
      setBoxes((current) => {
        if (current[id]) return current;
        const index = Object.keys(current).length;
        const offset = index * FLOAT_CASCADE_OFFSET;
        return {
          ...current,
          [id]: {
            x: 80 + offset,
            y: 80 + offset,
            width: DEFAULT_FLOAT_WIDTH,
            height: DEFAULT_FLOAT_HEIGHT,
            z: index + 1,
          },
        };
      });
      topZ.current += 1;
    },
    [],
  );

  const close = useCallback((id: string) => {
    setBoxes((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
  }, []);

  const move = useCallback((id: string, x: number, y: number) => {
    setBoxes((current) => {
      const box = current[id];
      if (!box) return current;
      return { ...current, [id]: clamp({ ...box, x, y }) };
    });
  }, []);

  const resize = useCallback((id: string, width: number, height: number) => {
    setBoxes((current) => {
      const box = current[id];
      if (!box) return current;
      return {
        ...current,
        [id]: {
          ...box,
          width: Math.max(MIN_FLOAT_WIDTH, width),
          height: Math.max(MIN_FLOAT_HEIGHT, height),
        },
      };
    });
  }, []);

  /** Clicking anywhere in a window brings it to the front. */
  const bringToFront = useCallback((id: string) => {
    setBoxes((current) => {
      const box = current[id];
      if (!box) return current;
      const next = topZ.current + 1;
      topZ.current = next;
      return { ...current, [id]: { ...box, z: next } };
    });
  }, []);

  const isFloating = useCallback((id: string) => id in boxes, [boxes]);

  return { boxes, ids, open, close, move, resize, bringToFront, isFloating };
}
