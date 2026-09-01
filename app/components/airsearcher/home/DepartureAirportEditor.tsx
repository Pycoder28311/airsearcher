"use client";

import { useState } from "react";
import Button from "@/framework/ui/buttons/Button";
import SearchInput from "@/framework/ui/searchInput/SearchInput";
import Text from "@/framework/ui/iconText/Text";
import { colorSecondary, grayLight, grayMid, radius } from "@/config/theme";
import { GREEK_AIRPORTS } from "@/data/greekAirports";
import { airportByCode } from "@/data/places";
import { bestGatheringAirport } from "@/lib/airsearcher/geo";
import type { AirportCode, OriginGroup } from "@/lib/airsearcher/types";
import Stepper from "../common/Stepper";

/**
 * Add, remove and size the group's departure airports, and say which of them
 * the whole group should gather at.
 *
 * Used in two places — the Home page's departure dropdown and the results
 * sidebar's Departure airports filter — so the two can never drift apart.
 */
export default function DepartureAirportEditor({
  origins,
  onChange,
  gatheringAirport,
  onGatheringChange,
}: {
  origins: OriginGroup[];
  onChange: (next: OriginGroup[]) => void;
  gatheringAirport: AirportCode;
  onGatheringChange: (next: AirportCode) => void;
}) {
  const [query, setQuery] = useState("");

  const used = new Set(origins.map((o) => o.airport));
  const matches =
    query.trim() === ""
      ? []
      : GREEK_AIRPORTS.filter(
          (airport) =>
            !used.has(airport.code) &&
            (airport.code.toLowerCase() === query.trim().toLowerCase() ||
              airport.name.toLowerCase().includes(query.trim().toLowerCase())),
        ).slice(0, 6);

  const setPassengers = (airport: AirportCode, passengers: number) => {
    onChange(origins.map((o) => (o.airport === airport ? { ...o, passengers } : o)));
  };

  const remove = (airport: AirportCode) => {
    const next = origins.filter((o) => o.airport !== airport);
    onChange(next);
    // Never leave the group gathering at an airport it no longer departs from.
    if (airport === gatheringAirport && next.length > 0) {
      onGatheringChange(next[0].airport);
    }
  };

  const suggestion = bestGatheringAirport(origins);

  return (
    <div className="flex w-80 flex-col gap-3">
      <div className="flex flex-col gap-1">
        {origins.length === 0 && (
          <Text
            size="small"
            value="No departure airports yet"
            className="text-gray-400 italic"
          />
        )}

        {origins.map((origin) => {
          const airport = airportByCode(origin.airport);
          const isHub = origin.airport === gatheringAirport;

          return (
            <div
              key={origin.airport}
              className={`flex items-center gap-2 ${radius} border px-2 py-2 ${
                isHub ? colorSecondary.border : grayMid.border
              } ${isHub ? "" : grayLight.bgHover}`}
            >
              <Button
                styleType="tertiary"
                onClick={() => onGatheringChange(origin.airport)}
                className="min-w-0 flex-1 flex-col items-start bg-transparent! px-0! py-0! text-left hover:bg-transparent!"
              >
                <Text
                  size="small"
                  value={origin.airport}
                  className={`font-semibold ${isHub ? colorSecondary.text : "text-gray-900"}`}
                />
                <Text
                  size="very small"
                  value={isHub ? "Gathering airport" : (airport?.name ?? "")}
                  className={`truncate ${isHub ? colorSecondary.text : "text-gray-400"}`}
                />
              </Button>

              <Stepper
                value={origin.passengers}
                onChange={(next) => setPassengers(origin.airport, next)}
                min={0}
                max={500}
                label="passenger"
              />

              <Button
                styleType="delete"
                onClick={() => remove(origin.airport)}
                className="h-8 w-8 shrink-0 p-0!"
              >
                <Text icon="trash" size="very small" />
                <span className="sr-only">Remove {origin.airport}</span>
              </Button>
            </div>
          );
        })}
      </div>

      <div className="flex flex-col gap-1">
        <SearchInput
          styleType="simple"
          placeholder="Add a Greek airport…"
          value={query}
          onType={setQuery}
        />
        {matches.length > 0 && (
          <div className={`flex flex-col ${radius} border ${grayMid.border} p-1`}>
            {matches.map((airport) => (
              <Button
                key={airport.code}
                styleType="tertiary"
                onClick={() => {
                  onChange([...origins, { airport: airport.code, passengers: 0 }]);
                  setQuery("");
                }}
                className="w-full justify-start! gap-2 bg-transparent! px-2! py-1.5! text-left"
              >
                <Text size="small" value={airport.code} className="font-medium text-gray-900" />
                <Text
                  size="very small"
                  value={airport.name}
                  className="truncate text-gray-400"
                />
              </Button>
            ))}
          </div>
        )}
      </div>

      <Button
        styleType="tertiary-bordered"
        disabled={suggestion === null || suggestion === gatheringAirport}
        onClick={() => suggestion && onGatheringChange(suggestion)}
        className="w-full"
      >
        <Text
          size="small"
          value={
            suggestion === null
              ? "Add airports to compare"
              : suggestion === gatheringAirport
                ? `${suggestion} is already the best gathering point`
                : `Use ${suggestion} as the gathering airport`
          }
        />
      </Button>
    </div>
  );
}
