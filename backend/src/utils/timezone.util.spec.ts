import {
  getMonthRangeUtc,
  normalizeDayKey,
  getAllDaysInMonth,
  normalizeMonthKey,
} from './timezone.util';

describe('Timezone Utilities', () => {
  describe('getMonthRangeUtc', () => {
    it('should return correct UTC range for Europe/Istanbul timezone', () => {
      // Europe/Istanbul is UTC+3 in Feb 2026 (assuming no DST change)
      const { startUtc, endUtc } = getMonthRangeUtc(
        '2026-02',
        'Europe/Istanbul',
      );

      // 2026-02-01 00:00:00 Istanbul = 2026-01-31 21:00:00 UTC
      expect(startUtc.toISOString()).toBe('2026-01-31T21:00:00.000Z');

      // 2026-03-01 00:00:00 Istanbul = 2026-02-28 21:00:00 UTC
      expect(endUtc.toISOString()).toBe('2026-02-28T21:00:00.000Z');
    });

    it('should handle months with different UTC offsets due to DST', () => {
      // Test a month that might have DST transitions
      const { startUtc, endUtc } = getMonthRangeUtc(
        '2026-03',
        'Europe/Istanbul',
      );

      // Start date should be in Istanbul local midnight
      const startDate = new Date(startUtc);
      expect(startDate.getUTCMonth()).toBe(1); // February (DST not yet active)

      // End date should be proper month boundary
      const endDate = new Date(endUtc);
      expect(endDate.getUTCMonth()).toBe(2); // March
    });

    it('should work for UTC timezone', () => {
      const { startUtc, endUtc } = getMonthRangeUtc('2026-02', 'UTC');

      expect(startUtc.toISOString()).toBe('2026-02-01T00:00:00.000Z');
      expect(endUtc.toISOString()).toBe('2026-03-01T00:00:00.000Z');
    });

    it('should work for timezones behind UTC', () => {
      // America/New_York is UTC-5 in Feb 2026 (EST, no DST)
      const { startUtc, endUtc } = getMonthRangeUtc(
        '2026-02',
        'America/New_York',
      );

      // 2026-02-01 00:00:00 EST = 2026-02-01 05:00:00 UTC
      expect(startUtc.toISOString()).toBe('2026-02-01T05:00:00.000Z');

      // 2026-03-01 00:00:00 EST = 2026-03-01 05:00:00 UTC
      expect(endUtc.toISOString()).toBe('2026-03-01T05:00:00.000Z');
    });
  });

  describe('normalizeDayKey', () => {
    it('should convert UTC date to Istanbul day key', () => {
      // This is the key bug fix test case
      // 2026-02-13T21:35:00Z = 2026-02-14 00:35:00 Istanbul
      const utcDate = new Date('2026-02-13T21:35:00.000Z');
      const dayKey = normalizeDayKey(utcDate, 'Europe/Istanbul');

      expect(dayKey).toBe('2026-02-14');
    });

    it('should keep same day for midday UTC times', () => {
      // 2026-02-14T12:00:00Z = 2026-02-14 15:00:00 Istanbul (same day)
      const utcDate = new Date('2026-02-14T12:00:00.000Z');
      const dayKey = normalizeDayKey(utcDate, 'Europe/Istanbul');

      expect(dayKey).toBe('2026-02-14');
    });

    it('should work for UTC timezone', () => {
      const utcDate = new Date('2026-02-14T12:00:00.000Z');
      const dayKey = normalizeDayKey(utcDate, 'UTC');

      expect(dayKey).toBe('2026-02-14');
    });

    it('should handle day boundary at midnight', () => {
      // 2026-02-13T21:00:00Z = 2026-02-14 00:00:00 Istanbul (exactly midnight)
      const utcDate = new Date('2026-02-13T21:00:00.000Z');
      const dayKey = normalizeDayKey(utcDate, 'Europe/Istanbul');

      expect(dayKey).toBe('2026-02-14');
    });

    it('should handle just before midnight', () => {
      // 2026-02-13T20:59:59Z = 2026-02-13 23:59:59 Istanbul (still Feb 13)
      const utcDate = new Date('2026-02-13T20:59:59.000Z');
      const dayKey = normalizeDayKey(utcDate, 'Europe/Istanbul');

      expect(dayKey).toBe('2026-02-13');
    });
  });

  describe('getAllDaysInMonth', () => {
    it('should return all days for February 2026 (28 days)', () => {
      const days = getAllDaysInMonth('2026-02', 'Europe/Istanbul');

      expect(days).toHaveLength(28);
      expect(days[0]).toBe('2026-02-01');
      expect(days[27]).toBe('2026-02-28');
    });

    it('should return all days for January (31 days)', () => {
      const days = getAllDaysInMonth('2026-01', 'Europe/Istanbul');

      expect(days).toHaveLength(31);
      expect(days[0]).toBe('2026-01-01');
      expect(days[30]).toBe('2026-01-31');
    });

    it('should work for leap year February', () => {
      const days = getAllDaysInMonth('2024-02', 'Europe/Istanbul');

      expect(days).toHaveLength(29);
      expect(days[28]).toBe('2024-02-29');
    });

    it('should work regardless of timezone', () => {
      const daysIstanbul = getAllDaysInMonth('2026-02', 'Europe/Istanbul');
      const daysNY = getAllDaysInMonth('2026-02', 'America/New_York');

      // Same month should have same number of days regardless of timezone
      expect(daysIstanbul).toHaveLength(28);
      expect(daysNY).toHaveLength(28);
    });
  });

  describe('normalizeMonthKey', () => {
    it('should convert UTC date to Istanbul month key', () => {
      // 2026-02-28T23:35:00Z = 2026-03-01 02:35:00 Istanbul
      const utcDate = new Date('2026-02-28T23:35:00.000Z');
      const monthKey = normalizeMonthKey(utcDate, 'Europe/Istanbul');

      expect(monthKey).toBe('2026-03');
    });

    it('should keep same month for midday UTC times', () => {
      // 2026-02-14T12:00:00Z = 2026-02-14 15:00:00 Istanbul (same month)
      const utcDate = new Date('2026-02-14T12:00:00.000Z');
      const monthKey = normalizeMonthKey(utcDate, 'Europe/Istanbul');

      expect(monthKey).toBe('2026-02');
    });

    it('should work for UTC timezone', () => {
      const utcDate = new Date('2026-02-14T12:00:00.000Z');
      const monthKey = normalizeMonthKey(utcDate, 'UTC');

      expect(monthKey).toBe('2026-02');
    });

    it('should handle month boundary at midnight', () => {
      // 2026-02-28T21:00:00Z = 2026-03-01 00:00:00 Istanbul (exactly midnight of next month)
      const utcDate = new Date('2026-02-28T21:00:00.000Z');
      const monthKey = normalizeMonthKey(utcDate, 'Europe/Istanbul');

      expect(monthKey).toBe('2026-03');
    });

    it('should handle just before month boundary', () => {
      // 2026-02-28T20:59:59Z = 2026-02-28 23:59:59 Istanbul (still February)
      const utcDate = new Date('2026-02-28T20:59:59.000Z');
      const monthKey = normalizeMonthKey(utcDate, 'Europe/Istanbul');

      expect(monthKey).toBe('2026-02');
    });
  });

  describe('Real-world bug scenario', () => {
    it('should group sales correctly at day boundary', () => {
      // Mobile app makes a sale at 00:35 Istanbul time on Feb 14
      // This is stored as 21:35 UTC on Feb 13
      // Backend must group this under Feb 14, not Feb 13

      const soldAtUtc = new Date('2026-02-13T21:35:00.000Z');
      const dayKey = normalizeDayKey(soldAtUtc, 'Europe/Istanbul');

      // This should be Feb 14 (matching mobile display), not Feb 13 (UTC)
      expect(dayKey).toBe('2026-02-14');
    });

    it('should calculate correct month range for querying', () => {
      // When querying for Feb 2026 in Istanbul timezone
      const { startUtc, endUtc } = getMonthRangeUtc(
        '2026-02',
        'Europe/Istanbul',
      );

      // Range should capture all sales that occurred in February in Istanbul time
      // Including sales that happened in UTC on Jan 31 evening (Feb 1 morning in Istanbul)

      // Sale at 22:00 UTC on Jan 31 = 01:00 Istanbul on Feb 1 (should be included)
      const sale1 = new Date('2026-01-31T22:00:00.000Z');
      expect(sale1 >= startUtc && sale1 < endUtc).toBe(true);

      // Sale at 20:00 UTC on Jan 31 = 23:00 Istanbul on Jan 31 (should NOT be included)
      const sale2 = new Date('2026-01-31T20:00:00.000Z');
      expect(sale2 >= startUtc && sale2 < endUtc).toBe(false);

      // Sale at 20:00 UTC on Feb 28 = 23:00 Istanbul on Feb 28 (should be included)
      const sale3 = new Date('2026-02-28T20:00:00.000Z');
      expect(sale3 >= startUtc && sale3 < endUtc).toBe(true);

      // Sale at 22:00 UTC on Feb 28 = 01:00 Istanbul on Mar 1 (should NOT be included)
      const sale4 = new Date('2026-02-28T22:00:00.000Z');
      expect(sale4 >= startUtc && sale4 < endUtc).toBe(false);
    });
  });
});
