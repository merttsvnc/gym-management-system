import { Prisma } from '@prisma/client';

/**
 * Converts a Prisma Decimal, number, string, null, or undefined to a string formatted with 2 decimal places.
 *
 * This is essential for API responses to ensure consistent money formatting and avoid
 * returning Prisma Decimal objects which may not serialize properly to JSON.
 *
 * @param value - The value to convert (Prisma.Decimal, number, string, null, or undefined)
 * @returns A string with exactly 2 decimal places (e.g., "123.45", "0.00")
 *
 * @example
 * toMoneyString(new Prisma.Decimal(123.456)) // "123.46"
 * toMoneyString(123.456) // "123.46"
 * toMoneyString("123.456") // "123.46"
 * toMoneyString(null) // "0.00"
 * toMoneyString(undefined) // "0.00"
 */
export function toMoneyString(
  value: Prisma.Decimal | string | number | null | undefined,
): string {
  if (value === null || value === undefined) {
    return '0.00';
  }

  // If it's already a Prisma.Decimal, use toFixed
  if (value instanceof Prisma.Decimal) {
    return value.toFixed(2);
  }

  // Convert string or number to Prisma.Decimal, then format
  const decimal = new Prisma.Decimal(value.toString());
  return decimal.toFixed(2);
}
