import Text from "@/framework/ui/iconText/Text";
import { border, grayLight, radiusBig } from "@/config/theme";

/**
 * One titled block of the style guide: a card holding every variation that a
 * single config file defines. Layout only — it knows nothing about configs.
 */
export default function StyleGuideSection({
  title,
  source,
  children,
}: {
  title: string;
  /** Path of the config file this section documents, shown under the title. */
  source: string;
  children: React.ReactNode;
}) {
  return (
    <section className={`${grayLight.bg} ${border} ${radiusBig} p-4 sm:p-6`}>
      <header className="mb-5 flex flex-col gap-0.5">
        <Text size="big" value={title} className="font-semibold text-gray-900" />
        <Text size="very small" value={source} className="font-mono text-gray-400" />
      </header>

      <div className="flex flex-col gap-4">{children}</div>
    </section>
  );
}
