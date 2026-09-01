import Text from "@/framework/ui/iconText/Text";
import { grayMid } from "@/config/theme";

/**
 * A labelled row inside a style-guide section: the variant name on the left,
 * the live component(s) on the right. Stacks on mobile, side by side from `sm`.
 */
export default function VariantRow({
  label,
  hint,
  children,
}: {
  label: string;
  /** Optional note shown under the label, e.g. a caveat about hover states. */
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`flex flex-col gap-3 border-b ${grayMid.border} pb-4 last:border-b-0 last:pb-0 sm:flex-row sm:items-start sm:gap-6`}
    >
      <div className="flex shrink-0 flex-col gap-0.5 sm:w-40">
        <Text size="small" value={label} className="font-mono text-gray-700" />
        {hint && <Text size="very small" value={hint} className="text-gray-400" />}
      </div>

      <div className="flex flex-1 flex-wrap items-center gap-3">{children}</div>
    </div>
  );
}
