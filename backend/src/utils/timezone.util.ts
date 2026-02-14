import { DateTime } from 'luxon';

/**
 * Timezone utilities for business-day grouping in reports
 *
 * Purpose: Convert UTC timestamps to tenant local time for accurate business-day calculations.
 * Use case: Sales at 21:35 UTC on Feb 13 should be counted as Feb 14 in Europe/Istanbul (UTC+3).
 *
 * Key principle: Always store timestamps in UTC (timestamptz), but group by tenant timezone.
 */

/**
 * Get UTC date range for a given month in a specific timezone
 *
 * Takes a month key (YYYY-MM) and returns the UTC date range that corresponds to
 * the entire month in the given timezone.
 *
 * Example:
 * - Month: "2026-02", Timezone: "Europe/Istanbul"
 * - Local start: 2026-02-01 00:00:00 (Istanbul) = 2026-01-31 21:00:00 UTC
 * - Local end: 2026-03-01 00:00:00 (Istanbul) = 2026-02-28 21:00:00 UTC
 * - Returns: { startUtc: Date(2026-01-31T21:00:00.000Z), endUtc: Date(2026-02-28T21:00:00.000Z) }
 *
 * Usage in queries:
 * - WHERE sold_at >= startUtc AND sold_at < endUtc
 *
 * @param monthKey - Month in YYYY-MM format
 * @param timezone - IANA timezone string (e.g., "Europe/Istanbul")
 * @returns UTC date range for the month in the given timezone
 */
export function getMonthRangeUtc(
  monthKey: string,
  timezone: string,
): { startUtc: Date; endUtc: Date } {
  const [year, month] = monthKey.split('-');
  const yearNum = parseInt(year, 10);
  const monthNum = parseInt(month, 10);

  // Start of month in tenant timezone (e.g., 2026-02-01 00:00:00 Istanbul)
  const startLocal = DateTime.fromObject(
    {
      year: yearNum,
      month: monthNum,
      day: 1,
      hour: 0,
      minute: 0,
      second: 0,
      millisecond: 0,
    },
    { zone: timezone },
  );

  // Start of next month in tenant timezone (e.g., 2026-03-01 00:00:00 Istanbul)
  const endLocal = startLocal.plus({ months: 1 });

  // Convert both to UTC Dates
  return {
    startUtc: startLocal.toJSDate(),
    endUtc: endLocal.toJSDate(),
  };
}

/**
 * Normalize a UTC Date to a day key in a specific timezone
 *
 * Converts a UTC timestamp to a date string (YYYY-MM-DD) in the given timezone.
 *
 * Example:
 * - UTC: 2026-02-13T21:35:00.000Z
 * - Timezone: "Europe/Istanbul" (UTC+3)
 * - Local time: 2026-02-14 00:35:00
 * - Returns: "2026-02-14"
 *
 * Usage in grouping:
 * - Convert all timestamps to day keys in tenant timezone
 * - Group revenue by these day keys
 *
 * @param date - UTC Date object
 * @param timezone - IANA timezone string (e.g., "Europe/Istanbul")
 * @returns Day key in YYYY-MM-DD format in the given timezone
 */
export function normalizeDayKey(date: Date, timezone: string): string {
  const dt = DateTime.fromJSDate(date, { zone: 'UTC' });
  const localDt = dt.setZone(timezone);
  return localDt.toFormat('yyyy-MM-dd');
}

/**
 * Get all day keys for a given month in a specific timezone
 *
 * Returns an array of date strings (YYYY-MM-DD) for every day in the month.
 *
 * Example:
 * - Month: "2026-02", Timezone: "Europe/Istanbul"
 * - Returns: ["2026-02-01", "2026-02-02", ..., "2026-02-28"]
 *
 * Usage in reports:
 * - Generate all days in a month to ensure reports include zero-revenue days
 *
 * @param monthKey - Month in YYYY-MM format
 * @param timezone - IANA timezone string (e.g., "Europe/Istanbul")
 * @returns Array of day keys in YYYY-MM-DD format
 */
export function getAllDaysInMonth(
  monthKey: string,
  timezone: string,
): string[] {
  const [year, month] = monthKey.split('-');
  const yearNum = parseInt(year, 10);
  const monthNum = parseInt(month, 10);

  // Start of month in tenant timezone
  const startLocal = DateTime.fromObject(
    {
      year: yearNum,
      month: monthNum,
      day: 1,
      hour: 0,
      minute: 0,
      second: 0,
      millisecond: 0,
    },
    { zone: timezone },
  );

  // Get number of days in this month
  const daysInMonth = startLocal.daysInMonth || 0;

  // Generate array of day keys
  const days: string[] = [];
  for (let day = 1; day <= daysInMonth; day++) {
    const dayDate = startLocal.set({ day });
    days.push(dayDate.toFormat('yyyy-MM-dd'));
  }

  return days;
}

/**
 * Get month key in YYYY-MM format from a UTC date in a specific timezone
 *
 * Converts a UTC timestamp to a month key in the given timezone.
 *
 * Example:
 * - UTC: 2026-02-28T23:35:00.000Z
 * - Timezone: "Europe/Istanbul" (UTC+3)
 * - Local time: 2026-03-01 02:35:00
 * - Returns: "2026-03"
 *
 * Usage in trend reports:
 * - Group revenue by month in tenant timezone
 *
 * @param date - UTC Date object
 * @param timezone - IANA timezone string (e.g., "Europe/Istanbul")
 * @returns Month key in YYYY-MM format in the given timezone
 */
export function normalizeMonthKey(date: Date, timezone: string): string {
  const dt = DateTime.fromJSDate(date, { zone: 'UTC' });
  const localDt = dt.setZone(timezone);
  return localDt.toFormat('yyyy-MM');
}
