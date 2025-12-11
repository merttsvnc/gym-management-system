import { addDays, addMonths } from 'date-fns';
import { DurationType } from '@prisma/client';
import { BadRequestException } from '@nestjs/common';

/**
 * Calculate membership end date from start date and plan duration
 *
 * Business rules:
 * - For DAYS: Simple date addition (startDate + durationValue days)
 * - For MONTHS: Calendar month addition with month-end clamping
 *   - Example: Jan 31 + 1 month = Feb 28/29 (leap year dependent)
 *   - Example: Mar 31 + 1 month = Apr 30
 *   - Example: Jan 15 + 1 month = Feb 15 (day exists, no clamping needed)
 *
 * Duration value validation:
 * - DAYS: Must be between 1 and 730 (inclusive) - maximum 2 years
 * - MONTHS: Must be between 1 and 24 (inclusive) - maximum 2 years
 *
 * @param startDate - Membership start date
 * @param durationType - Duration type (DAYS or MONTHS)
 * @param durationValue - Duration value (1-730 for DAYS, 1-24 for MONTHS)
 * @returns Calculated end date
 * @throws BadRequestException if duration value is out of valid range
 */
export function calculateMembershipEndDate(
  startDate: Date,
  durationType: DurationType,
  durationValue: number,
): Date {
  // Validate duration value ranges
  if (durationType === 'DAYS') {
    if (durationValue < 1 || durationValue > 730) {
      throw new BadRequestException(
        'Süre değeri 1 ile 730 gün arasında olmalıdır',
      );
    }
    return addDays(startDate, durationValue);
  } else if (durationType === 'MONTHS') {
    if (durationValue < 1 || durationValue > 24) {
      throw new BadRequestException(
        'Süre değeri 1 ile 24 ay arasında olmalıdır',
      );
    }
    // date-fns addMonths handles month-end clamping correctly
    // Jan 31 + 1 month = Feb 28/29, Mar 31 + 1 month = Apr 30, etc.
    return addMonths(startDate, durationValue);
  } else {
    throw new BadRequestException(
      `Geçersiz süre tipi: ${durationType as string}. DAYS veya MONTHS olmalıdır.`,
    );
  }
}
