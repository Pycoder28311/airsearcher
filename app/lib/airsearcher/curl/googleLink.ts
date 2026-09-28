/**
 * Links that open one exact search on Google Flights.
 *
 * Google Flights encodes a search in the `tfs` parameter as a small protobuf
 * message, base64url-encoded. Decoded from links the browser produced:
 *
 *   1: 28, 2: 2                      — constants the page always sends
 *   3: leg (repeated) {
 *        2: "YYYY-MM-DD"
 *        13: from place (repeated) { 1: type, 2: id }
 *        14: to place   (repeated) { 1: type, 2: id }
 *      }
 *   8: 1 per adult (repeated)        9: 1 = economy
 *   14: 1                            16: { 1: 2^64 - 1 }  — no price limit
 *   19: 2 = one-way, 1 = round trip
 *
 * Place type 2/3 is a Google city id ("/m/0n2z"); 1 is an airport code. Several
 * places per side are sent as repeated fields — the airport type and repeats
 * match public reverse-engineering but were not seen in a copied link yet.
 */

import { CURRENCY } from "@/lib/airsearcher/config/constants";

export interface LinkPlace {
  id: string;
  /** 1 = airport code, 2/3 = Google city id (origin/destination side). */
  type: number;
}

export interface LinkSearch {
  from: LinkPlace[];
  to: LinkPlace[];
  date: string;
}

/* ── A minimal protobuf writer: varints and length-delimited fields only ── */

const SEVEN_BITS = BigInt(0x7f);
const SEVEN = BigInt(7);
const ZERO = BigInt(0);
/** 2^64 - 1: the "no price limit" value Google sends. */
const NO_LIMIT = BigInt("18446744073709551615");

function varint(value: bigint): number[] {
  const bytes: number[] = [];
  let rest = value;
  do {
    let byte = Number(rest & SEVEN_BITS);
    rest >>= SEVEN;
    if (rest > ZERO) byte |= 0x80;
    bytes.push(byte);
  } while (rest > ZERO);
  return bytes;
}

function fieldVarint(field: number, value: bigint | number): number[] {
  return [...varint(BigInt(field << 3)), ...varint(BigInt(value))];
}

function fieldBytes(field: number, bytes: number[]): number[] {
  return [...varint(BigInt((field << 3) | 2)), ...varint(BigInt(bytes.length)), ...bytes];
}

function fieldString(field: number, text: string): number[] {
  return fieldBytes(field, [...new TextEncoder().encode(text)]);
}

function place(p: LinkPlace): number[] {
  return [...fieldVarint(1, p.type), ...fieldString(2, p.id)];
}

function toBase64Url(bytes: number[]): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** The `tfs` value for one one-way search, 1 adult, economy. */
export function tfsFor(search: LinkSearch): string {
  const leg = [
    ...fieldString(2, search.date),
    ...search.from.flatMap((p) => fieldBytes(13, place(p))),
    ...search.to.flatMap((p) => fieldBytes(14, place(p))),
  ];
  return toBase64Url([
    ...fieldVarint(1, 28),
    ...fieldVarint(2, 2),
    ...fieldBytes(3, leg),
    ...fieldVarint(8, 1),
    ...fieldVarint(9, 1),
    ...fieldVarint(14, 1),
    ...fieldBytes(16, fieldVarint(1, NO_LIMIT)),
    ...fieldVarint(19, 2),
  ]);
}

/** Airport codes as link places. */
export function airports(codes: string[]): LinkPlace[] {
  return codes.map((id) => ({ id, type: 1 }));
}

/** Opens the search on Google Flights, in English, priced in the app's currency. */
export function googleFlightsSearchUrl(search: LinkSearch): string {
  const params = new URLSearchParams({ tfs: tfsFor(search), hl: "en-GB", curr: CURRENCY });
  return `https://www.google.com/travel/flights/search?${params}`;
}
