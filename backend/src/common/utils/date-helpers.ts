/**
 * Date helper utilities for business logic
 */

/**
 * Converts a Date to a month key string in "YYYY-MM" format
 * @param date - The date to convert
 * @returns Month key string (e.g., "2026-02")
 */
export function getMonthKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

/**
 * Validates if a string is a valid month key format
 * @param monthKey - The month key string to validate
 * @returns true if valid, false otherwise
 */
export function isValidMonthKey(monthKey: string): boolean {
  const regex = /^\d{4}-(0[1-9]|1[0-2])$/;
  return regex.test(monthKey);
}
