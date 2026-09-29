import Text from "@/framework/ui/iconText/Text";

/** Prices on the results page are green (the user's choice); the rest of the tag stays grey. */
export const PRICE_TEXT = "text-green-500";

/**
 * A flight's price, e.g. "178 €", and "BOTH" after it when one ticket covers
 * two flights with a stop between them. Only the price is coloured.
 */
export default function PriceTag({ price, both = false }: { price: string; both?: boolean }) {
  return (
    <span className="inline-flex items-baseline gap-1 whitespace-nowrap">
      <Text size="very small" value={price} className={`tabular-nums ${PRICE_TEXT}`} />
      {both && <Text size="very small" value="BOTH" className="text-gray-500" />}
    </span>
  );
}
