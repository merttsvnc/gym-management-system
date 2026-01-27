/**
 * Membership Status Utility
 *
 * Provides derived membership status calculation based on membershipEndDate.
 * This is the single source of truth for membership activity status.
 *
 * BUSINESS RULE:
 * A member is ACTIVE iff:
 * - membershipEndDate is not null AND membershipEndDate >= today (start of day)
 *
 * Otherwise member is EXPIRED/INACTIVE.
 *
 * "Expiring Soon" means ACTIVE and membershipEndDate is within next 7 days (inclusive).
 */

export type MembershipState = 'ACTIVE' | 'EXPIRED';

export interface DerivedMembershipStatus {
  /** True if membership is currently active (endDate >= today) */
  isMembershipActive: boolean;

  /** Membership state: ACTIVE or EXPIRED */
  membershipState: MembershipState;

  /** Days remaining until expiration (0 if expired, null if no endDate) */
  daysRemaining: number | null;

  /** True if active and expiring within next 7 days */
  isExpiringSoon: boolean;
}

/**
 * Get today's date at start of day (00:00:00) in server local time
 */
export function getTodayStart(): Date {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

/**
 * Calculate derived membership status for a single member
 *
 * @param membershipEndDate - The membership end date (or null)
 * @param referenceDate - Reference date for calculation (defaults to today)
 * @returns Derived membership status fields
 */
export function calculateMembershipStatus(
  membershipEndDate: Date | string | null,
  referenceDate: Date = getTodayStart(),
): DerivedMembershipStatus {
  // Ensure reference date is at start of day
  const today = new Date(referenceDate);
  today.setHours(0, 0, 0, 0);

  // If no membership end date, consider expired
  if (!membershipEndDate) {
    return {
      isMembershipActive: false,
      membershipState: 'EXPIRED',
      daysRemaining: null,
      isExpiringSoon: false,
    };
  }

  // Parse and normalize end date to start of day
  const endDate = new Date(membershipEndDate);
  endDate.setHours(0, 0, 0, 0);

  // Calculate days remaining
  const timeDiff = endDate.getTime() - today.getTime();
  const daysDiff = Math.ceil(timeDiff / (1000 * 60 * 60 * 24));
  const daysRemaining = Math.max(0, daysDiff);

  // Determine if active (endDate >= today)
  const isMembershipActive = endDate >= today;

  // Determine if expiring soon (active and within 7 days)
  const isExpiringSoon = isMembershipActive && daysRemaining <= 7;

  return {
    isMembershipActive,
    membershipState: isMembershipActive ? 'ACTIVE' : 'EXPIRED',
    daysRemaining: isMembershipActive ? daysRemaining : 0,
    isExpiringSoon,
  };
}

/**
 * Create Prisma where clause for active members
 * Active = membershipEndDate >= today
 *
 * @param referenceDate - Reference date for calculation (defaults to today)
 * @returns Prisma where clause
 */
export function getActiveMembershipWhere(
  referenceDate: Date = getTodayStart(),
) {
  const today = new Date(referenceDate);
  today.setHours(0, 0, 0, 0);

  return {
    membershipEndDate: {
      gte: today,
    },
  };
}

/**
 * Create Prisma where clause for expired members
 * Expired = membershipEndDate < today OR membershipEndDate IS NULL
 *
 * @param referenceDate - Reference date for calculation (defaults to today)
 * @returns Prisma where clause
 */
export function getExpiredMembershipWhere(
  referenceDate: Date = getTodayStart(),
) {
  const today = new Date(referenceDate);
  today.setHours(0, 0, 0, 0);

  return {
    OR: [
      {
        membershipEndDate: {
          lt: today,
        },
      },
      {
        membershipEndDate: null,
      },
    ],
  };
}

/**
 * Create Prisma where clause for expiring soon members
 * Expiring soon = active (membershipEndDate >= today) AND membershipEndDate <= today+7
 *
 * @param referenceDate - Reference date for calculation (defaults to today)
 * @returns Prisma where clause
 */
export function getExpiringSoonMembershipWhere(
  referenceDate: Date = getTodayStart(),
) {
  const today = new Date(referenceDate);
  today.setHours(0, 0, 0, 0);

  const sevenDaysFromToday = new Date(today);
  sevenDaysFromToday.setDate(sevenDaysFromToday.getDate() + 7);

  return {
    membershipEndDate: {
      gte: today,
      lte: sevenDaysFromToday,
    },
  };
}
