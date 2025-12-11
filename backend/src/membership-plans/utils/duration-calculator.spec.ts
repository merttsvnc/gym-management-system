import { calculateMembershipEndDate } from './duration-calculator';
import { DurationType } from '@prisma/client';

describe('DurationCalculator', () => {
  describe('DAYS duration', () => {
    it('should add days correctly for simple dates', () => {
      const startDate = new Date('2024-01-15');
      const endDate = calculateMembershipEndDate(
        startDate,
        DurationType.DAYS,
        30,
      );
      expect(endDate).toEqual(new Date('2024-02-14'));
    });

    it('should handle minimum duration (1 day)', () => {
      const startDate = new Date('2024-01-15');
      const endDate = calculateMembershipEndDate(
        startDate,
        DurationType.DAYS,
        1,
      );
      expect(endDate).toEqual(new Date('2024-01-16'));
    });

    it('should handle maximum duration (730 days)', () => {
      const startDate = new Date('2024-01-15');
      const endDate = calculateMembershipEndDate(
        startDate,
        DurationType.DAYS,
        730,
      );
      expect(endDate).toEqual(new Date('2026-01-14'));
    });

    it('should throw error for duration < 1', () => {
      const startDate = new Date('2024-01-15');
      expect(() => {
        calculateMembershipEndDate(startDate, DurationType.DAYS, 0);
      }).toThrow('Süre değeri 1 ile 730 gün arasında olmalıdır');
    });

    it('should throw error for duration > 730', () => {
      const startDate = new Date('2024-01-15');
      expect(() => {
        calculateMembershipEndDate(startDate, DurationType.DAYS, 731);
      }).toThrow('Süre değeri 1 ile 730 gün arasında olmalıdır');
    });
  });

  describe('MONTHS duration', () => {
    it('should add months correctly for dates where day exists in target month', () => {
      const startDate = new Date('2024-01-15');
      const endDate = calculateMembershipEndDate(
        startDate,
        DurationType.MONTHS,
        1,
      );
      expect(endDate).toEqual(new Date('2024-02-15'));
    });

    it('should clamp to last day of month when day does not exist (Jan 31 + 1 month)', () => {
      const startDate = new Date('2024-01-31');
      const endDate = calculateMembershipEndDate(
        startDate,
        DurationType.MONTHS,
        1,
      );
      // 2024 is a leap year, so Feb has 29 days
      expect(endDate).toEqual(new Date('2024-02-29'));
    });

    it('should clamp to last day of month for non-leap year (Jan 31 + 1 month)', () => {
      const startDate = new Date('2023-01-31');
      const endDate = calculateMembershipEndDate(
        startDate,
        DurationType.MONTHS,
        1,
      );
      // 2023 is not a leap year, so Feb has 28 days
      expect(endDate).toEqual(new Date('2023-02-28'));
    });

    it('should handle Mar 31 + 1 month = Apr 30', () => {
      const startDate = new Date('2024-03-31');
      const endDate = calculateMembershipEndDate(
        startDate,
        DurationType.MONTHS,
        1,
      );
      expect(endDate).toEqual(new Date('2024-04-30'));
    });

    it('should handle year boundary crossing', () => {
      const startDate = new Date('2024-11-15');
      const endDate = calculateMembershipEndDate(
        startDate,
        DurationType.MONTHS,
        2,
      );
      expect(endDate).toEqual(new Date('2025-01-15'));
    });

    it('should handle minimum duration (1 month)', () => {
      const startDate = new Date('2024-01-15');
      const endDate = calculateMembershipEndDate(
        startDate,
        DurationType.MONTHS,
        1,
      );
      expect(endDate).toEqual(new Date('2024-02-15'));
    });

    it('should handle maximum duration (24 months)', () => {
      const startDate = new Date('2024-01-15');
      const endDate = calculateMembershipEndDate(
        startDate,
        DurationType.MONTHS,
        24,
      );
      expect(endDate).toEqual(new Date('2026-01-15'));
    });

    it('should throw error for duration < 1', () => {
      const startDate = new Date('2024-01-15');
      expect(() => {
        calculateMembershipEndDate(startDate, DurationType.MONTHS, 0);
      }).toThrow('Süre değeri 1 ile 24 ay arasında olmalıdır');
    });

    it('should throw error for duration > 24', () => {
      const startDate = new Date('2024-01-15');
      expect(() => {
        calculateMembershipEndDate(startDate, DurationType.MONTHS, 25);
      }).toThrow('Süre değeri 1 ile 24 ay arasında olmalıdır');
    });

    // T117: Edge cases for leap years and year boundaries
    it('should handle leap year date + 12 months correctly (Feb 29 + 12 months)', () => {
      // Starting on leap day (Feb 29, 2024)
      const startDate = new Date('2024-02-29');
      const endDate = calculateMembershipEndDate(
        startDate,
        DurationType.MONTHS,
        12,
      );
      // 2025 is not a leap year, so should clamp to Feb 28
      expect(endDate).toEqual(new Date('2025-02-28'));
    });

    it('should handle year boundary crossing with month-end clamping (Oct 31 + 4 months)', () => {
      const startDate = new Date('2024-10-31');
      const endDate = calculateMembershipEndDate(
        startDate,
        DurationType.MONTHS,
        4,
      );
      // Oct 31 + 4 months = Feb 2025 (not leap year) = Feb 28
      expect(endDate).toEqual(new Date('2025-02-28'));
    });

    it('should handle multiple year boundaries (Nov 15 + 14 months)', () => {
      const startDate = new Date('2024-11-15');
      const endDate = calculateMembershipEndDate(
        startDate,
        DurationType.MONTHS,
        14,
      );
      expect(endDate).toEqual(new Date('2026-01-15'));
    });

    it('should handle negative duration value', () => {
      const startDate = new Date('2024-01-15');
      expect(() => {
        calculateMembershipEndDate(startDate, DurationType.MONTHS, -1);
      }).toThrow('Süre değeri 1 ile 24 ay arasında olmalıdır');
    });
  });

  describe('DAYS duration - edge cases', () => {
    // T115 & T117: Additional edge cases for DAYS
    it('should add 365 days correctly', () => {
      const startDate = new Date('2024-01-01');
      const endDate = calculateMembershipEndDate(
        startDate,
        DurationType.DAYS,
        365,
      );
      // 2024 is a leap year, so +365 days lands on Dec 31, 2024
      expect(endDate).toEqual(new Date('2024-12-31'));
    });

    it('should handle leap year day addition (Feb 28 + 1 day in leap year)', () => {
      const startDate = new Date('2024-02-28');
      const endDate = calculateMembershipEndDate(
        startDate,
        DurationType.DAYS,
        1,
      );
      expect(endDate).toEqual(new Date('2024-02-29'));
    });

    it('should handle leap year day addition (Feb 28 + 1 day in non-leap year)', () => {
      const startDate = new Date('2023-02-28');
      const endDate = calculateMembershipEndDate(
        startDate,
        DurationType.DAYS,
        1,
      );
      expect(endDate).toEqual(new Date('2023-03-01'));
    });

    it('should handle year boundary (Dec 31 + 1 day)', () => {
      const startDate = new Date('2024-12-31');
      const endDate = calculateMembershipEndDate(
        startDate,
        DurationType.DAYS,
        1,
      );
      expect(endDate).toEqual(new Date('2025-01-01'));
    });

    it('should throw error for negative duration', () => {
      const startDate = new Date('2024-01-15');
      expect(() => {
        calculateMembershipEndDate(startDate, DurationType.DAYS, -5);
      }).toThrow('Süre değeri 1 ile 730 gün arasında olmalıdır');
    });
  });
});
