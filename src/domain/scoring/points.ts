/**
 * Exact point math. Points are stored as numeric(9,4), so we compute in integer ten-thousandths
 * ("units") and only convert back to a number at the edge. Doubles cannot add 4.1 four times
 * cleanly; integers can, and 4 decimal places is the storage precision anyway.
 */

const SCALE = 10_000;
const QUANTITY_SCALE = 100; // quantity is numeric(7,2)

/** Points (or any 4-decimal number) to integer units. Rounds away the float noise in e.g. 4.1. */
export function toUnits(points: number): number {
  return Math.round(points * SCALE);
}

/** Integer units back to a plain number (nearest double to the exact 4-decimal value). */
export function fromUnits(units: number): number {
  return units / SCALE;
}

/** rate (units) × quantity, exact for quantities with up to 2 decimals. Returns integer units. */
export function multiplyUnits(rateUnits: number, quantity: number): number {
  return Math.round((rateUnits * Math.round(quantity * QUANTITY_SCALE)) / QUANTITY_SCALE);
}

/** Exact decimal product, e.g. multiplyPoints(4.1, 4) === 16.4. */
export function multiplyPoints(rate: number, quantity: number): number {
  return fromUnits(multiplyUnits(toUnits(rate), quantity));
}

/** Exact decimal sum of point values. */
export function sumPoints(values: readonly number[]): number {
  return fromUnits(values.reduce((acc, value) => acc + toUnits(value), 0));
}
