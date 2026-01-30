/**
 * Date utility functions for date-only operations
 * 
 * These functions normalize dates to UTC midnight to avoid timezone issues
 * when working with date-only business logic (e.g., membership dates).
 * 
 * All date-only comparisons and arithmetic should use these utilities
 * to ensure consistency across different server timezones.
 */

/**
 * Normalize a date to UTC midnight (date-only, no time component)
 * Use this for all date-only business logic to avoid timezone issues
 * 
 * @param date - Date to normalize (can be Date object or null/undefined)
 * @returns Date normalized to UTC midnight, or null if input is null/undefined
 */
export function toDateOnlyUTC(date: Date | null | undefined): Date | null {
  if (!date) return null;
  const normalized = new Date(date);
  normalized.setUTCHours(0, 0, 0, 0);
  return normalized;
}

/**
 * Add days to a date-only value (UTC normalized)
 * Returns a new date normalized to UTC midnight
 * 
 * @param date - Base date (will be normalized to UTC midnight)
 * @param days - Number of days to add (can be negative)
 * @returns New date normalized to UTC midnight
 */
export function addDaysDateOnlyUTC(date: Date, days: number): Date {
  const normalized = toDateOnlyUTC(date)!;
  normalized.setUTCDate(normalized.getUTCDate() + days);
  return normalized;
}
