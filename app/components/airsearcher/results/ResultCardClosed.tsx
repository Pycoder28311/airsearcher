"use client";

import Button from "@/framework/ui/buttons/Button";
import Text from "@/framework/ui/iconText/Text";
import { border, colorMain, radius } from "@/config/theme";
import { CURRENCY } from "@/lib/airsearcher/config/constants";
import { formatPriceRange, groupPriceRange } from "@/lib/airsearcher/grouping";
import { googleFlightsUrl } from "@/lib/airsearcher/links";
import {
  formatClock,
  formatDate,
  parseIsoDate,
} from "@/lib/airsearcher/time";
import {
  journeyFlights,
  type Arrangement,
  type GroupLeg,
  type NormalizedFlight,
  type NormalizedSegment,
} from "@/lib/airsearcher/types";
import PriceTag, { PRICE_TEXT } from "./PriceTag";

/** "Tue 13 Oct 2026" — the flying day with its weekday. */
export function withWeekday(iso: string | null): string {
  const date = iso ? parseIsoDate(iso) : null;
  if (!date) return formatDate(iso);
  return `${date.toLocaleDateString("en-GB", { weekday: "short" })} ${formatDate(iso)}`;
}

/** An airport on the route, with its clock times above it. */
function RouteStop({
  airport,
  arrival,
  departure,
}: {
  airport: string | null | undefined;
  /** Landing time here; omitted where the journey starts. */
  arrival?: string | null;
  /** Take-off time from here; omitted where the journey ends. */
  departure?: string | null;
}) {
  const layover = arrival !== undefined && departure !== undefined;

  return (
    <div className="flex shrink-0 flex-col items-center">
      {/* Times share the top row with the prices; a layover shows landing left, take-off right. */}
      <div className={`flex h-4 items-end gap-2 ${layover ? "" : "justify-center"}`}>
        {arrival !== undefined && (
          <Text size="very small" value={formatClock(arrival)} className="tabular-nums text-gray-500" />
        )}
        {departure !== undefined && (
          <Text size="very small" value={formatClock(departure)} className="tabular-nums text-gray-500" />
        )}
      </div>
      <div className="flex h-5 items-center">
        <Text size="small" value={airport ?? "—"} className="font-semibold text-gray-900" />
      </div>
    </div>
  );
}

/** "€" for euros; any other currency keeps its code. */
const CURRENCY_SYMBOL = CURRENCY === "EUR" ? "€" : CURRENCY;

/** The result's price as the price grid writes it: cheapest group first, priciest second. */
export function priceRangeOf(arrangement: Arrangement): string {
  return formatPriceRange(groupPriceRange(arrangement), CURRENCY_SYMBOL);
}

/** A long arrow between two airports, with its ticket's price above it. */
function RouteArrow({
  price,
  both,
  minWidth,
  url,
}: {
  /** Empty on the arrows after a ticket's first: its price is already shown. */
  price: string;
  both: boolean;
  minWidth: string;
  /** Google Flights for this ticket; splits the arrow with a link icon. */
  url: string | null;
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center px-1.5">
      <div className="flex h-4 items-end">{price && <PriceTag price={price} both={both} />}</div>
      <div className={`flex h-5 w-full items-center ${minWidth}`}>
        {url && (
          <>
            <div className="h-px flex-1 bg-gray-400" />
            {/* A new tab, so the results page stays open behind it. */}
            <Button
              styleType="underline"
              onClick={() => window.open(url, "_blank", "noopener,noreferrer")}
              className="mx-1 shrink-0"
            >
              <Text size="very small" icon="external-link" />
            </Button>
          </>
        )}
        <div className="relative h-px flex-1 bg-gray-400">
          <span className="absolute -right-px -top-[3.5px] border-y-4 border-l-[7px] border-y-transparent border-l-gray-400" />
        </div>
      </div>
    </div>
  );
}

/** One plane ride: a segment, and the price label to put over its arrow. */
interface Hop {
  key: string;
  segment: NormalizedSegment;
  /** The ticket's price on its first arrow, "" on the rest. */
  price: string;
  /** Whether that price covers this and the next flights ("BOTH"). */
  both: boolean;
  /** Google Flights for the ticket, on its first (priced) arrow only. */
  url: string | null;
  /** Relative arrow length: 3 is normal; a ticket's own stop is split 4 then 2. */
  weight: 2 | 3 | 4;
}

/** Arrow minimum widths per weight, scaled from the normal 40px / 56px. */
const ARROW_MIN_WIDTH: Record<Hop["weight"], string> = {
  2: "min-w-[27px] sm:min-w-[37px]",
  3: "min-w-10 sm:min-w-14",
  4: "min-w-[53px] sm:min-w-[75px]",
};

/**
 * Every plane ride of a journey, in order. A ticket with its own stop (one
 * price for several segments) is split at that stop like any other: its price
 * goes over the first arrow marked "BOTH", and the arrows after it stay empty.
 * That first arrow is drawn 4/3 as long and the rest 2/3, so the priced one
 * reads as the ticket's main arrow.
 */
function hopsOf(flights: NormalizedFlight[]): Hop[] {
  return flights.flatMap((flight) => {
    const segments = flight.outbound.segments;
    const price =
      flight.price === null ? "—" : `${Math.round(flight.price)} ${CURRENCY_SYMBOL}`;
    const url = googleFlightsUrl(flight);
    return segments.map((segment, i) => ({
      key: `${flight.id}-${i}`,
      segment,
      price: i > 0 ? "" : price,
      both: i === 0 && segments.length > 1,
      url: i === 0 ? url : null,
      weight: segments.length === 1 ? 3 : i === 0 ? 4 : 2,
    }));
  });
}

/** One group's journey in the order it is flown: stops joined by priced arrows. */
function RouteLine({ flights }: { flights: NormalizedFlight[] }) {
  const hops = hopsOf(flights);
  if (hops.length === 0) return null;

  return (
    <div className={`flex shrink-0 grow items-start ${border} ${radius} px-3 py-1`}>
      <RouteStop
        airport={hops[0].segment.departure.airport}
        departure={hops[0].segment.departure.time ?? null}
      />
      {hops.map((hop, i) => {
        const next = hops[i + 1];
        return (
          <div
            key={hop.key}
            className="flex flex-1 items-start"
            style={{ flexGrow: hop.weight }}
          >
            <RouteArrow price={hop.price} both={hop.both} minWidth={ARROW_MIN_WIDTH[hop.weight]} url={hop.url} />
            <RouteStop
              airport={hop.segment.arrival.airport}
              arrival={hop.segment.arrival.time ?? null}
              departure={next ? (next.segment.departure.time ?? null) : undefined}
            />
          </div>
        );
      })}
    </div>
  );
}

/** The DEP / RET summary block of the Penpot closed card. */
function DirectionSummary({
  label,
  legs,
  direction,
  date,
  large,
  price,
}: {
  label: string;
  legs: GroupLeg[];
  direction: "outbound" | "return";
  date: string | null;
  /** Bigger header text, for exact-date searches that have no date header above. */
  large: boolean;
  /** The result's price range, at the end of the row; only the DEP row has it. */
  price?: string;
}) {
  const journeys = legs
    .map((leg) => (direction === "outbound" ? leg.outbound : leg.return))
    .filter((journey) => journey !== null);

  if (journeys.length === 0) return null;

  const flown = journeys.map(journeyFlights);
  const airlines = [
    ...new Set(
      flown
        .flat()
        .map((f) => f.airline.name)
        .filter(Boolean),
    ),
  ];

  // Groups flying the exact same flights share one route line.
  const unique = [
    ...new Map(
      flown.map((flights) => [flights.map((f) => f.id).join("|"), flights]),
    ).values(),
  ];
  // A route already drawn inside a longer one is dropped: ATH → FCO is not
  // repeated when SKG → ATH → FCO boards that very same ATH → FCO flight.
  const routes = unique.filter(
    (flights) =>
      !unique.some(
        (other) =>
          other.length > flights.length &&
          flights.every((f) => other.some((o) => o.id === f.id)),
      ),
  );

  return (
    <div className={`flex w-full min-w-0 flex-col gap-1 ${radius} px-2 py-1`}>
      <div className="flex items-baseline gap-2">
        <Text
          size={large ? "medium" : "very small"}
          value={label}
          className={`font-semibold ${colorMain.text}`}
        />
        <Text
          size={large ? "medium" : "very small"}
          value={withWeekday(date)}
          className={large ? "font-medium text-gray-900" : "text-gray-500"}
        />
        <Text
          size={large ? "small" : "very small"}
          value={airlines.join(", ") || "—"}
          className="min-w-0 truncate text-gray-500"
        />
        {price && (
          <Text
            size={large ? "medium" : "small"}
            value={price}
            className={`ml-auto shrink-0 whitespace-nowrap font-semibold tabular-nums ${PRICE_TEXT}`}
          />
        )}
      </div>

      {/* Each group's route in its own rounded box, stretched to fill the row. */}
      <div className="flex flex-wrap gap-x-6 gap-y-3">
        {routes.map((flights) => (
          <RouteLine key={flights.map((f) => f.id).join("|")} flights={flights} />
        ))}
      </div>
    </div>
  );
}

/**
 * The collapsed result: one DEP row and one RET row — the Penpot closed state.
 */
export default function ResultCardClosed({
  arrangement,
  largeHeaders = false,
}: {
  arrangement: Arrangement;
  /** Exact-date searches: bigger DEP / RET headers, since there is no date header above. */
  largeHeaders?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      {/* One row per direction: DEP, then RET. */}
      <div className="flex flex-col gap-1">
        <DirectionSummary
          label="DEP"
          legs={arrangement.legs}
          direction="outbound"
          date={arrangement.departureDate}
          large={largeHeaders}
          // Date-range searches show it in the date header above instead.
          price={largeHeaders ? priceRangeOf(arrangement) : undefined}
        />
        <DirectionSummary
          label="RET"
          legs={arrangement.legs}
          direction="return"
          date={arrangement.returnDate}
          large={largeHeaders}
        />
      </div>
    </div>
  );
}
