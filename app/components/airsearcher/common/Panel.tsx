import { border, radius, shadow } from "@/config/theme";

/**
 * The white surface every anchored dropdown sits on.
 *
 * AbsoluteModal positions its content but does not style it, so without this
 * each dropdown would repeat the same surface classes and drift apart.
 */
export default function Panel({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`bg-white ${border} ${radius} ${shadow} p-3 ${className}`}>
      {children}
    </div>
  );
}
