/**
 * Branded numeric units.
 *
 * Unit confusion is the single largest bug class in a simulator that spans
 * fourteen orders of magnitude, so the type system is made to carry the unit.
 * `Meters` and `Kilometers` are both `number` at runtime and cost nothing, but
 * they are mutually unassignable at compile time: passing a radius in kilometres
 * to a function that wants metres is a type error, not a silent 1000x mistake.
 *
 * Construct a branded value with the matching constructor (`meters(6.371e6)`)
 * and convert only through the named conversions below. There is deliberately
 * no generic `unbrand`; read the value with the matching accessor so the call
 * site says which unit it expected.
 *
 * @module
 */

declare const unitBrand: unique symbol;

/**
 * Attaches a compile-time-only tag to a primitive.
 *
 * @template T - The underlying primitive representation.
 * @template B - A unique string tag naming the unit.
 */
type Brand<T, B extends string> = T & { readonly [unitBrand]: B };

/** A length in metres. The simulation's canonical length unit. */
export type Meters = Brand<number, 'Meters'>;

/** A length in kilometres. Used for display and for source data only. */
export type Kilometers = Brand<number, 'Kilometers'>;

/** A length in astronomical units (1 au = 149 597 870 700 m, IAU 2012). */
export type AstronomicalUnits = Brand<number, 'AstronomicalUnits'>;

/** A duration in seconds. The simulation's canonical time unit. */
export type Seconds = Brand<number, 'Seconds'>;

/** A duration in days of exactly 86 400 seconds. */
export type Days = Brand<number, 'Days'>;

/** An angle in radians. Every trigonometric call in the project takes these. */
export type Radians = Brand<number, 'Radians'>;

/** An angle in degrees. Used for display and for source data only. */
export type Degrees = Brand<number, 'Degrees'>;

/** A mass in kilograms. */
export type Kilograms = Brand<number, 'Kilograms'>;

/**
 * A standard gravitational parameter, GM, in m^3 s^-2.
 *
 * Orbital mechanics uses GM rather than mass because the product is measured to
 * far more significant figures than either factor: G is known to about 5 digits,
 * but GM for the Earth is known to 10.
 */
export type GravitationalParameter = Brand<number, 'GravitationalParameter'>;

/** Metres per second. */
export type MetersPerSecond = Brand<number, 'MetersPerSecond'>;

/** Metres in one astronomical unit, exactly, by IAU 2012 Resolution B2. */
export const METERS_PER_AU = 149_597_870_700;

/** Seconds in one day of exactly 86 400 seconds. */
export const SECONDS_PER_DAY = 86_400;

/**
 * Tags a raw number as metres.
 *
 * @param value - A length already expressed in metres.
 * @returns The same number, branded.
 */
export function meters(value: number): Meters {
  return value as Meters;
}

/**
 * Tags a raw number as kilometres.
 *
 * @param value - A length already expressed in kilometres.
 * @returns The same number, branded.
 */
export function kilometers(value: number): Kilometers {
  return value as Kilometers;
}

/**
 * Tags a raw number as astronomical units.
 *
 * @param value - A length already expressed in astronomical units.
 * @returns The same number, branded.
 */
export function astronomicalUnits(value: number): AstronomicalUnits {
  return value as AstronomicalUnits;
}

/**
 * Tags a raw number as seconds.
 *
 * @param value - A duration already expressed in seconds.
 * @returns The same number, branded.
 */
export function seconds(value: number): Seconds {
  return value as Seconds;
}

/**
 * Tags a raw number as days of 86 400 seconds.
 *
 * @param value - A duration already expressed in days.
 * @returns The same number, branded.
 */
export function days(value: number): Days {
  return value as Days;
}

/**
 * Tags a raw number as radians.
 *
 * @param value - An angle already expressed in radians.
 * @returns The same number, branded.
 */
export function radians(value: number): Radians {
  return value as Radians;
}

/**
 * Tags a raw number as degrees.
 *
 * @param value - An angle already expressed in degrees.
 * @returns The same number, branded.
 */
export function degrees(value: number): Degrees {
  return value as Degrees;
}

/**
 * Tags a raw number as kilograms.
 *
 * @param value - A mass already expressed in kilograms.
 * @returns The same number, branded.
 */
export function kilograms(value: number): Kilograms {
  return value as Kilograms;
}

/**
 * Tags a raw number as a standard gravitational parameter in m^3 s^-2.
 *
 * @param value - A GM value already expressed in m^3 s^-2.
 * @returns The same number, branded.
 */
export function gravitationalParameter(value: number): GravitationalParameter {
  return value as GravitationalParameter;
}

/**
 * Tags a raw number as metres per second.
 *
 * @param value - A speed already expressed in metres per second.
 * @returns The same number, branded.
 */
export function metersPerSecond(value: number): MetersPerSecond {
  return value as MetersPerSecond;
}

/**
 * Reads a branded length back as a plain number of metres.
 *
 * @param value - The branded length.
 * @returns The underlying number, in metres.
 */
export function toRawMeters(value: Meters): number {
  return value;
}

/**
 * Reads a branded duration back as a plain number of seconds.
 *
 * @param value - The branded duration.
 * @returns The underlying number, in seconds.
 */
export function toRawSeconds(value: Seconds): number {
  return value;
}

/**
 * Reads a branded angle back as a plain number of radians.
 *
 * @param value - The branded angle.
 * @returns The underlying number, in radians.
 */
export function toRawRadians(value: Radians): number {
  return value;
}

/**
 * Converts kilometres to metres.
 *
 * @param value - A length in kilometres.
 * @returns The same length in metres.
 */
export function kilometersToMeters(value: Kilometers): Meters {
  return meters(value * 1000);
}

/**
 * Converts metres to kilometres.
 *
 * @param value - A length in metres.
 * @returns The same length in kilometres.
 */
export function metersToKilometers(value: Meters): Kilometers {
  return kilometers(value / 1000);
}

/**
 * Converts astronomical units to metres.
 *
 * @param value - A length in astronomical units.
 * @returns The same length in metres.
 */
export function auToMeters(value: AstronomicalUnits): Meters {
  return meters(value * METERS_PER_AU);
}

/**
 * Converts metres to astronomical units.
 *
 * @param value - A length in metres.
 * @returns The same length in astronomical units.
 */
export function metersToAu(value: Meters): AstronomicalUnits {
  return astronomicalUnits(value / METERS_PER_AU);
}

/**
 * Converts days to seconds.
 *
 * @param value - A duration in days of 86 400 seconds.
 * @returns The same duration in seconds.
 */
export function daysToSeconds(value: Days): Seconds {
  return seconds(value * SECONDS_PER_DAY);
}

/**
 * Converts seconds to days.
 *
 * @param value - A duration in seconds.
 * @returns The same duration in days of 86 400 seconds.
 */
export function secondsToDays(value: Seconds): Days {
  return days(value / SECONDS_PER_DAY);
}

/**
 * Converts degrees to radians.
 *
 * @param value - An angle in degrees.
 * @returns The same angle in radians.
 */
export function degreesToRadians(value: Degrees): Radians {
  return radians((value * Math.PI) / 180);
}

/**
 * Converts radians to degrees.
 *
 * @param value - An angle in radians.
 * @returns The same angle in degrees.
 */
export function radiansToDegrees(value: Radians): Degrees {
  return degrees((value * 180) / Math.PI);
}
