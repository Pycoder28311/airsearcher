"use client";

import { useRef } from "react";
import Button from "@/framework/ui/buttons/Button";
import Text from "@/framework/ui/iconText/Text";
import { useAbsoluteModal } from "@/framework/ui/context/AppContext";
import Panel from "./Panel";

/** How long the hint waits before closing, so the mouse can reach it. */
const CLOSE_DELAY_MS = 200;

/**
 * A small info icon that explains something: on hover with a mouse, on tap on
 * a touch screen. The explanation stays open while the pointer is on it.
 */
export default function InfoHint({ text, label = "More information" }: { text: string; label?: string }) {
  const hint = useAbsoluteModal<HTMLSpanElement>();
  const pointerType = useRef("mouse");

  const args = {
    side: "bottom" as const,
    align: "start" as const,
    offset: 4,
    closeOnLeave: true,
    component: (
      <Panel className="max-w-80">
        <Text size="very small" value={text} className="text-gray-700" />
      </Panel>
    ),
  };

  return (
    <span
      {...hint.triggerProps}
      className="inline-flex"
      onPointerEnter={(event) => {
        pointerType.current = event.pointerType;
        if (event.pointerType !== "mouse") return;
        if (hint.isOpen) hint.cancelClose();
        else hint.open(args);
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === "mouse") hint.closeSoon(CLOSE_DELAY_MS);
      }}
    >
      <Button
        styleType="tertiary"
        onClick={() => {
          if (pointerType.current !== "mouse") hint.toggle(args);
        }}
        className="h-6 w-6 rounded-full! bg-transparent! p-0! hover:bg-gray-400/30!"
      >
        <Text icon="info" size="small" className="text-gray-500" />
        <span className="sr-only">{label}</span>
      </Button>
    </span>
  );
}
