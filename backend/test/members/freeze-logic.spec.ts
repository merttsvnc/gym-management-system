import { MembersService } from '../../src/members/members.service';
import { MemberStatus } from '@prisma/client';

/**
 * Specialized tests for calculateRemainingDays() freeze logic
 * Tests various pause/resume scenarios and edge cases
 */
describe('MembersService - Freeze Logic (calculateRemainingDays)', () => {
  let service: MembersService;

  beforeEach(() => {
    // We only need the service instance for calling calculateRemainingDays
    // This method doesn't use Prisma, so no need to mock it
    service = new MembersService(null as any);
  });

  describe('Basic scenarios without pause history', () => {
    it('should return full membership duration if membership has not started yet', () => {
      const now = new Date();
      const startAt = new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000); // 10 days from now
      const endAt = new Date(startAt.getTime() + 365 * 24 * 60 * 60 * 1000); // 1 year later

      const member = {
        membershipStartAt: startAt,
        membershipEndAt: endAt,
        status: MemberStatus.ACTIVE,
        pausedAt: null,
        resumedAt: null,
      };

      const remainingDays = service.calculateRemainingDays(member);

      // Should return approximately 365 days (full duration)
      expect(remainingDays).toBeGreaterThanOrEqual(364);
      expect(remainingDays).toBeLessThanOrEqual(366);
    });

    it('should return correct remaining days for active membership with no pauses', () => {
      const now = new Date();
      const startAt = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); // Started 30 days ago
      const endAt = new Date(now.getTime() + 335 * 24 * 60 * 60 * 1000); // Ends in 335 days

      const member = {
        membershipStartAt: startAt,
        membershipEndAt: endAt,
        status: MemberStatus.ACTIVE,
        pausedAt: null,
        resumedAt: null,
      };

      const remainingDays = service.calculateRemainingDays(member);

      // Should return approximately 335 days (365 total - 30 elapsed)
      expect(remainingDays).toBeGreaterThanOrEqual(334);
      expect(remainingDays).toBeLessThanOrEqual(336);
    });

    it('should return negative remaining days for expired membership', () => {
      const now = new Date();
      const startAt = new Date(now.getTime() - 400 * 24 * 60 * 60 * 1000); // Started 400 days ago
      const endAt = new Date(now.getTime() - 35 * 24 * 60 * 60 * 1000); // Ended 35 days ago

      const member = {
        membershipStartAt: startAt,
        membershipEndAt: endAt,
        status: MemberStatus.INACTIVE,
        pausedAt: null,
        resumedAt: null,
      };

      const remainingDays = service.calculateRemainingDays(member);

      // Should return approximately -35 days
      expect(remainingDays).toBeLessThan(0);
      expect(remainingDays).toBeGreaterThanOrEqual(-36);
      expect(remainingDays).toBeLessThanOrEqual(-34);
    });

    it('should return 0 for invalid membership dates (end before start)', () => {
      const now = new Date();
      const startAt = new Date(now.getTime() + 100 * 24 * 60 * 60 * 1000);
      const endAt = new Date(now.getTime() - 100 * 24 * 60 * 60 * 1000);

      const member = {
        membershipStartAt: startAt,
        membershipEndAt: endAt,
        status: MemberStatus.ACTIVE,
        pausedAt: null,
        resumedAt: null,
      };

      const remainingDays = service.calculateRemainingDays(member);

      expect(remainingDays).toBe(0);
    });
  });

  describe('Currently paused scenarios', () => {
    it('should calculate remaining days correctly when currently paused', () => {
      const now = new Date();
      const startAt = new Date(now.getTime() - 50 * 24 * 60 * 60 * 1000); // Started 50 days ago
      const pausedAt = new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000); // Paused 20 days ago
      const endAt = new Date(startAt.getTime() + 365 * 24 * 60 * 60 * 1000); // 1 year membership

      const member = {
        membershipStartAt: startAt,
        membershipEndAt: endAt,
        status: MemberStatus.PAUSED,
        pausedAt,
        resumedAt: null,
      };

      const remainingDays = service.calculateRemainingDays(member);

      // Active days elapsed = 50 - 20 = 30 days (from start to pause)
      // Remaining = 365 - 30 = 335 days
      expect(remainingDays).toBeGreaterThanOrEqual(334);
      expect(remainingDays).toBeLessThanOrEqual(336);
    });

    it('should not count paused days against remaining time', () => {
      const now = new Date();
      const startAt = new Date(now.getTime() - 100 * 24 * 60 * 60 * 1000); // Started 100 days ago
      const pausedAt = new Date(now.getTime() - 70 * 24 * 60 * 60 * 1000); // Paused 70 days ago
      const endAt = new Date(startAt.getTime() + 365 * 24 * 60 * 60 * 1000);

      const member = {
        membershipStartAt: startAt,
        membershipEndAt: endAt,
        status: MemberStatus.PAUSED,
        pausedAt,
        resumedAt: null,
      };

      const remainingDays = service.calculateRemainingDays(member);

      // Active days elapsed = 100 - 70 = 30 days (only time before pause)
      // The 70 days of being paused don't count
      // Remaining = 365 - 30 = 335 days
      expect(remainingDays).toBeGreaterThanOrEqual(334);
      expect(remainingDays).toBeLessThanOrEqual(336);
    });

    it('should handle pause that started immediately at membership start', () => {
      const now = new Date();
      const startAt = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const pausedAt = startAt; // Paused immediately
      const endAt = new Date(startAt.getTime() + 365 * 24 * 60 * 60 * 1000);

      const member = {
        membershipStartAt: startAt,
        membershipEndAt: endAt,
        status: MemberStatus.PAUSED,
        pausedAt,
        resumedAt: null,
      };

      const remainingDays = service.calculateRemainingDays(member);

      // No active days elapsed (paused immediately)
      // Remaining = 365 days (full membership)
      expect(remainingDays).toBeGreaterThanOrEqual(364);
      expect(remainingDays).toBeLessThanOrEqual(366);
    });
  });

  describe('Previously paused and resumed scenarios', () => {
    it('should calculate remaining days correctly after a pause-resume cycle', () => {
      const now = new Date();
      const startAt = new Date(now.getTime() - 100 * 24 * 60 * 60 * 1000); // Started 100 days ago
      const pausedAt = new Date(now.getTime() - 70 * 24 * 60 * 60 * 1000); // Paused 70 days ago
      const resumedAt = new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000); // Resumed 20 days ago
      const endAt = new Date(startAt.getTime() + 365 * 24 * 60 * 60 * 1000);

      const member = {
        membershipStartAt: startAt,
        membershipEndAt: endAt,
        status: MemberStatus.ACTIVE,
        pausedAt,
        resumedAt,
      };

      const remainingDays = service.calculateRemainingDays(member);

      // Active days elapsed:
      // 1. Before pause: 100 - 70 = 30 days
      // 2. After resume: 20 days
      // Total active = 30 + 20 = 50 days
      // Remaining = 365 - 50 = 315 days
      expect(remainingDays).toBeGreaterThanOrEqual(314);
      expect(remainingDays).toBeLessThanOrEqual(316);
    });

    it('should handle multiple pause-resume cycles (using most recent)', () => {
      // Note: Current implementation only tracks one pause period
      // This tests that the most recent pause-resume is used correctly
      const now = new Date();
      const startAt = new Date(now.getTime() - 200 * 24 * 60 * 60 * 1000);
      const pausedAt = new Date(now.getTime() - 100 * 24 * 60 * 60 * 1000); // Most recent pause
      const resumedAt = new Date(now.getTime() - 50 * 24 * 60 * 60 * 1000); // Most recent resume
      const endAt = new Date(startAt.getTime() + 365 * 24 * 60 * 60 * 1000);

      const member = {
        membershipStartAt: startAt,
        membershipEndAt: endAt,
        status: MemberStatus.ACTIVE,
        pausedAt,
        resumedAt,
      };

      const remainingDays = service.calculateRemainingDays(member);

      // Active days elapsed:
      // 1. Before pause: 200 - 100 = 100 days
      // 2. After resume: 50 days
      // Total active = 100 + 50 = 150 days
      // Remaining = 365 - 150 = 215 days
      expect(remainingDays).toBeGreaterThanOrEqual(214);
      expect(remainingDays).toBeLessThanOrEqual(216);
    });

    it('should handle very short pause duration', () => {
      const now = new Date();
      const startAt = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const pausedAt = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);
      const resumedAt = new Date(now.getTime() - 9 * 24 * 60 * 60 * 1000); // Paused for 1 day
      const endAt = new Date(startAt.getTime() + 365 * 24 * 60 * 60 * 1000);

      const member = {
        membershipStartAt: startAt,
        membershipEndAt: endAt,
        status: MemberStatus.ACTIVE,
        pausedAt,
        resumedAt,
      };

      const remainingDays = service.calculateRemainingDays(member);

      // Active days elapsed:
      // 1. Before pause: 30 - 10 = 20 days
      // 2. After resume: 9 days
      // Total active = 20 + 9 = 29 days
      // Remaining = 365 - 29 = 336 days
      expect(remainingDays).toBeGreaterThanOrEqual(335);
      expect(remainingDays).toBeLessThanOrEqual(337);
    });

    it('should handle pause-resume with expired membership', () => {
      const now = new Date();
      const startAt = new Date(now.getTime() - 400 * 24 * 60 * 60 * 1000);
      const pausedAt = new Date(now.getTime() - 200 * 24 * 60 * 60 * 1000);
      const resumedAt = new Date(now.getTime() - 100 * 24 * 60 * 60 * 1000);
      const endAt = new Date(now.getTime() - 50 * 24 * 60 * 60 * 1000); // Expired 50 days ago

      const member = {
        membershipStartAt: startAt,
        membershipEndAt: endAt,
        status: MemberStatus.INACTIVE,
        pausedAt,
        resumedAt,
      };

      const remainingDays = service.calculateRemainingDays(member);

      // Total membership duration: 350 days (startAt to endAt = 400 - 50 = 350)
      // Active days elapsed:
      // 1. Before pause: pausedAt - startAt = 200 days
      // 2. Paused period: resumedAt - pausedAt = 100 days (not counted)
      // 3. After resume: now - resumedAt = 100 days
      // Total active: 200 + 100 = 300 days
      // Remaining: 350 - 300 = 50 days
      // Even though membership expired, the pause extended the duration
      expect(remainingDays).toBe(50);
    });
  });

  describe('Edge cases and boundary conditions', () => {
    it('should handle same-day membership start and end', () => {
      const now = new Date();
      const startAt = now;
      const endAt = now;

      const member = {
        membershipStartAt: startAt,
        membershipEndAt: endAt,
        status: MemberStatus.ACTIVE,
        pausedAt: null,
        resumedAt: null,
      };

      const remainingDays = service.calculateRemainingDays(member);

      expect(remainingDays).toBe(0);
    });

    it('should handle membership that spans leap year', () => {
      const now = new Date();
      const startAt = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000); // Started 180 days ago
      const endAt = new Date(startAt.getTime() + 366 * 24 * 60 * 60 * 1000); // 366 days from start (leap year)

      const member = {
        membershipStartAt: startAt,
        membershipEndAt: endAt,
        status: MemberStatus.ACTIVE,
        pausedAt: null,
        resumedAt: null,
      };

      const remainingDays = service.calculateRemainingDays(member);

      // Should account for leap year (366 days total, 180 elapsed)
      expect(remainingDays).toBeGreaterThanOrEqual(185);
      expect(remainingDays).toBeLessThanOrEqual(187);
    });

    it('should handle very long membership duration', () => {
      const now = new Date();
      const startAt = new Date(now.getTime() - 100 * 24 * 60 * 60 * 1000);
      const endAt = new Date(startAt.getTime() + 3650 * 24 * 60 * 60 * 1000); // 10 years

      const member = {
        membershipStartAt: startAt,
        membershipEndAt: endAt,
        status: MemberStatus.ACTIVE,
        pausedAt: null,
        resumedAt: null,
      };

      const remainingDays = service.calculateRemainingDays(member);

      // 3650 total - 100 elapsed = 3550 remaining
      expect(remainingDays).toBeGreaterThanOrEqual(3549);
      expect(remainingDays).toBeLessThanOrEqual(3551);
    });

    it('should round remaining days to integer', () => {
      const now = new Date();
      // Create dates that will result in fractional days
      const startAt = new Date(now.getTime() - 30.5 * 24 * 60 * 60 * 1000);
      const endAt = new Date(startAt.getTime() + 365 * 24 * 60 * 60 * 1000);

      const member = {
        membershipStartAt: startAt,
        membershipEndAt: endAt,
        status: MemberStatus.ACTIVE,
        pausedAt: null,
        resumedAt: null,
      };

      const remainingDays = service.calculateRemainingDays(member);

      // Result should be an integer
      expect(Number.isInteger(remainingDays)).toBe(true);
    });

    it('should handle resumedAt timestamp without pausedAt (edge case)', () => {
      // This shouldn't happen in practice, but test defensive behavior
      const now = new Date();
      const startAt = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const endAt = new Date(startAt.getTime() + 365 * 24 * 60 * 60 * 1000);

      const member = {
        membershipStartAt: startAt,
        membershipEndAt: endAt,
        status: MemberStatus.ACTIVE,
        pausedAt: null,
        resumedAt: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000),
      };

      const remainingDays = service.calculateRemainingDays(member);

      // Should handle gracefully and calculate as if no pause occurred
      expect(remainingDays).toBeGreaterThanOrEqual(334);
      expect(remainingDays).toBeLessThanOrEqual(336);
    });

    it('should handle pausedAt after resumedAt (invalid data)', () => {
      // This shouldn't happen, but test defensive behavior
      const now = new Date();
      const startAt = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const endAt = new Date(startAt.getTime() + 365 * 24 * 60 * 60 * 1000);

      const member = {
        membershipStartAt: startAt,
        membershipEndAt: endAt,
        status: MemberStatus.ACTIVE,
        pausedAt: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000),
        resumedAt: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000),
      };

      const remainingDays = service.calculateRemainingDays(member);

      // Should still return a valid number
      expect(typeof remainingDays).toBe('number');
      expect(Number.isFinite(remainingDays)).toBe(true);
    });
  });

  describe('Status-based scenarios', () => {
    it('should calculate correctly for INACTIVE status with pause history', () => {
      const now = new Date();
      const startAt = new Date(now.getTime() - 100 * 24 * 60 * 60 * 1000);
      const pausedAt = new Date(now.getTime() - 50 * 24 * 60 * 60 * 1000);
      const resumedAt = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const endAt = new Date(startAt.getTime() + 365 * 24 * 60 * 60 * 1000);

      const member = {
        membershipStartAt: startAt,
        membershipEndAt: endAt,
        status: MemberStatus.INACTIVE,
        pausedAt,
        resumedAt,
      };

      const remainingDays = service.calculateRemainingDays(member);

      // Should calculate the same way regardless of status
      expect(remainingDays).toBeGreaterThanOrEqual(284);
      expect(remainingDays).toBeLessThanOrEqual(286);
    });

    it('should calculate correctly for ARCHIVED status', () => {
      const now = new Date();
      const startAt = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const endAt = new Date(startAt.getTime() + 365 * 24 * 60 * 60 * 1000);

      const member = {
        membershipStartAt: startAt,
        membershipEndAt: endAt,
        status: MemberStatus.ARCHIVED,
        pausedAt: null,
        resumedAt: null,
      };

      const remainingDays = service.calculateRemainingDays(member);

      // Should calculate remaining days even for archived members
      expect(remainingDays).toBeGreaterThanOrEqual(334);
      expect(remainingDays).toBeLessThanOrEqual(336);
    });
  });
});
