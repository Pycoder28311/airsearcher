"use client";

import { useEffect, useState } from "react";
import Button from "@/framework/ui/buttons/Button";
import Text from "@/framework/ui/iconText/Text";
import {
  border,
  colorMain,
  colorRed,
  colorSecondary,
  grayLight,
  paddingSmall,
  radius,
} from "@/config/theme";
import type { RowStatus } from "./curlRunner";
import type { CurlRowState, RowCheck } from "./useCurlRun";

/**
 * The framework has no textarea component, so the cURL boxes are raw
 * `<textarea>`s styled from the theme tokens — shared so they stay identical.
 */
export function curlTextareaClass(invalid: boolean, locked: boolean): string {
  return `w-full resize-y bg-white font-mono text-xs text-gray-800 outline-none ${border} ${radius} ${paddingSmall} ${
    invalid ? colorRed.border : ""
  } ${colorMain.focusBorder} ${colorMain.focusRing} ${locked ? "opacity-70" : ""}`;
}

/** Seconds left until `until`, re-rendered every second while counting. */
function useCountdown(until: number | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (until === null) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [until]);
  return until === null ? 0 : Math.max(0, Math.ceil((until - now) / 1000));
}

/** What a sent (or queued) request is doing. Renders nothing while idle. */
export function RunStatus({ status }: { status: RowStatus }) {
  const seconds = useCountdown(status.kind === "pending" ? status.expectedStart : null);

  switch (status.kind) {
    case "pending":
      return (
        <Text
          size="very small"
          icon="clock"
          value={seconds > 0 ? `Waiting ~${seconds} s so requests stay human-paced…` : "Sending…"}
          className={colorMain.text}
        />
      );
    case "running":
      return <Text size="very small" icon="clock" value="Sending…" className={colorMain.text} />;
    case "done":
      return (
        <div className="flex flex-col gap-0.5">
          <Text
            size="very small"
            icon="check"
            value={`${status.flights} flight${status.flights === 1 ? "" : "s"} received`}
            className="text-gray-700"
          />
          {status.warnings.map((warning) => (
            <Text key={warning} size="very small" value={warning} className={colorSecondary.text} />
          ))}
        </div>
      );
    case "failed":
      return <Text size="very small" icon="alert" value={status.message} className={colorRed.text} />;
    case "skipped":
      return <Text size="very small" icon="info" value={status.message} className="text-gray-500" />;
    case "idle":
      return null;
  }
}

function StatusLine({ row, check }: { row: CurlRowState; check: RowCheck | undefined }) {
  if (row.status.kind !== "idle") return <RunStatus status={row.status} />;

  if (!check || check.kind === "empty") {
    return (
      <Text
        size="very small"
        value="Paste the GetShoppingResults request (Network tab → right-click → Copy as cURL)."
        className="text-gray-400"
      />
    );
  }
  if (check.kind === "invalid") {
    return <Text size="very small" icon="alert" value={check.message} className={colorRed.text} />;
  }
  return (
    <div className="flex flex-col gap-0.5">
      <Text size="very small" icon="check" value={check.label} className="text-gray-700" />
      {check.prepared.warnings.map((warning) => (
        <Text key={warning} size="very small" value={warning} className={colorSecondary.text} />
      ))}
    </div>
  );
}

export default function CurlRow({
  row,
  index,
  check,
  locked,
  onChange,
  onRemove,
}: {
  row: CurlRowState;
  index: number;
  check: RowCheck | undefined;
  /** True while a run is in progress: the text can't change under it. */
  locked: boolean;
  onChange: (text: string) => void;
  onRemove: () => void;
}) {
  const invalid = check?.kind === "invalid" && row.status.kind === "idle";

  return (
    <div className={`flex flex-col gap-2 ${grayLight.bg} ${radius} p-3`}>
      <div className="flex items-center justify-between gap-2">
        <Text size="small" value={`cURL ${index + 1}`} className="font-medium text-gray-800" />
        <Button styleType="delete" disabled={locked} onClick={onRemove} className="h-8 w-8 p-0!">
          <Text icon="trash" size="very small" />
          <span className="sr-only">Remove cURL {index + 1}</span>
        </Button>
      </div>

      <textarea
        value={row.text}
        onChange={(event) => onChange(event.target.value)}
        readOnly={locked}
        rows={4}
        spellCheck={false}
        autoComplete="off"
        placeholder="curl 'https://www.google.com/_/FlightsFrontendUi/data/…/GetShoppingResults?…' -X POST -H '…' --data-raw 'f.req=…'"
        aria-label={`cURL ${index + 1}`}
        className={curlTextareaClass(invalid, locked)}
      />

      <StatusLine row={row} check={check} />
    </div>
  );
}
