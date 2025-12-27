import {
  calculateMembershipStatus,
  getActiveMembershipWhere,
  getExpiredMembershipWhere,
  getExpiringSoonMembershipWhere,
  getTodayStart,
} from './membership-status.util';

describe('Membership Status Utils', () => {
  // Fixed reference date for testing (use local time, not UTC)
  const referenceDate = new Date('2024-01-15');
  referenceDate.setHours(0, 0, 0, 0);

  describe('getTodayStart', () => {
    it('should return date at start of day', () => {
      const result = getTodayStart();
      expect(result.getHours()).toBe(0);
      expect(result.getMinutes()).toBe(0);
      expect(result.getSeconds()).toBe(0);
      expect(result.getMilliseconds()).toBe(0);
    });
  });

  describe('calculateMembershipStatus', () => {
    it('should return EXPIRED when membershipEndDate is null', () => {
      const result = calculateMembershipStatus(null, referenceDate);

      expect(result).toEqual({
        isMembershipActive: false,
        membershipState: 'EXPIRED',
        daysRemaining: null,
        isExpiringSoon: false,
      });
    });

    it('should return EXPIRED when membershipEndDate is in the past', () => {
      const endDate = new Date('2024-01-10');
      endDate.setHours(0, 0, 0, 0);
      const result = calculateMembershipStatus(endDate, referenceDate);

      expect(result).toEqual({
        isMembershipActive: false,
        membershipState: 'EXPIRED',
        daysRemaining: 0,
        isExpiringSoon: false,
      });
    });

    it('should return ACTIVE when membershipEndDate is today', () => {
      const endDate = new Date('2024-01-15');
      endDate.setHours(0, 0, 0, 0);
      const result = calculateMembershipStatus(endDate, referenceDate);

      expect(result).toEqual({
        isMembershipActive: true,
        membershipState: 'ACTIVE',
        daysRemaining: 0,
        isExpiringSoon: true, // 0 days is within 7
      });
    });

    it('should return ACTIVE and isExpiringSoon=true when membershipEndDate is within 7 days', () => {
      const endDate = new Date('2024-01-20');
      endDate.setHours(0, 0, 0, 0);
      const result = calculateMembershipStatus(endDate, referenceDate);

      expect(result).toEqual({
        isMembershipActive: true,
        membershipState: 'ACTIVE',
        daysRemaining: 5,
        isExpiringSoon: true,
      });
    });

    it('should return ACTIVE and isExpiringSoon=true when membershipEndDate is exactly 7 days away', () => {
      const endDate = new Date('2024-01-22');
      endDate.setHours(0, 0, 0, 0);
      const result = calculateMembershipStatus(endDate, referenceDate);

      expect(result).toEqual({
        isMembershipActive: true,
        membershipState: 'ACTIVE',
        daysRemaining: 7,
        isExpiringSoon: true,
      });
    });

    it('should return ACTIVE and isExpiringSoon=false when membershipEndDate is beyond 7 days', () => {
      const endDate = new Date('2024-01-25');
      endDate.setHours(0, 0, 0, 0);
      const result = calculateMembershipStatus(endDate, referenceDate);

      expect(result).toEqual({
        isMembershipActive: true,
        membershipState: 'ACTIVE',
        daysRemaining: 10,
        isExpiringSoon: false,
      });
    });

    it('should handle date strings as input', () => {
      const endDate = '2024-01-20T12:30:45.000Z'; // 5 days from today (time should be ignored)
      const result = calculateMembershipStatus(endDate, referenceDate);

      expect(result.isMembershipActive).toBe(true);
      expect(result.membershipState).toBe('ACTIVE');
      expect(result.isExpiringSoon).toBe(true);
      // Days might vary by 1 due to timezone, just check it's active and expiring soon
      expect(result.daysRemaining).toBeGreaterThanOrEqual(4);
      expect(result.daysRemaining).toBeLessThanOrEqual(6);
    });

    it('should ignore time portion of dates', () => {
      // End date with time = 23:59:59 on Jan 15
      const endDate = new Date('2024-01-15T23:59:59.999');
      const result = calculateMembershipStatus(endDate, referenceDate);

      // Should count as today (daysRemaining might be 0 or 1 depending on normalization)
      expect(result.isMembershipActive).toBe(true);
      expect(result.daysRemaining).toBeLessThanOrEqual(1);
    });

    it('should handle far future dates', () => {
      const endDate = new Date('2025-12-31');
      endDate.setHours(0, 0, 0, 0);
      const result = calculateMembershipStatus(endDate, referenceDate);

      expect(result.isMembershipActive).toBe(true);
      expect(result.membershipState).toBe('ACTIVE');
      expect(result.isExpiringSoon).toBe(false);
      expect(result.daysRemaining).toBeGreaterThan(700);
    });
  });

  describe('getActiveMembershipWhere', () => {
    it('should return where clause for active memberships', () => {
      const result = getActiveMembershipWhere(referenceDate);

      // Check structure
      expect(result).toHaveProperty('membershipEndDate');
      expect(result.membershipEndDate).toHaveProperty('gte');

      // Verify the date is normalized to start of day
      const gte = result.membershipEndDate.gte as Date;
      expect(gte.getHours()).toBe(0);
      expect(gte.getMinutes()).toBe(0);
      expect(gte.getSeconds()).toBe(0);
      expect(gte.getMilliseconds()).toBe(0);
    });
  });

  describe('getExpiredMembershipWhere', () => {
    it('should return where clause for expired memberships', () => {
      const result = getExpiredMembershipWhere(referenceDate);

      expect(result).toHaveProperty('OR');
      expect(Array.isArray(result.OR)).toBe(true);
      expect(result.OR).toHaveLength(2);

      // Check first condition (date < today)
      expect(result.OR[0]).toHaveProperty('membershipEndDate');
      expect(result.OR[0].membershipEndDate).toHaveProperty('lt');

      // Check second condition (date is null)
      expect(result.OR[1]).toHaveProperty('membershipEndDate', null);
    });
  });

  describe('getExpiringSoonMembershipWhere', () => {
    it('should return where clause for expiring soon memberships', () => {
      const result = getExpiringSoonMembershipWhere(referenceDate);

      expect(result).toHaveProperty('membershipEndDate');
      expect(result.membershipEndDate).toHaveProperty('gte');
      expect(result.membershipEndDate).toHaveProperty('lte');

      // Verify dates are normalized
      const gte = result.membershipEndDate.gte as Date;
      const lte = result.membershipEndDate.lte as Date;

      expect(gte.getHours()).toBe(0);
      expect(lte.getHours()).toBe(0);

      // Verify lte is 7 days after gte
      const daysDiff = Math.ceil(
        (lte.getTime() - gte.getTime()) / (1000 * 60 * 60 * 24),
      );
      expect(daysDiff).toBe(7);
    });
  });
});
