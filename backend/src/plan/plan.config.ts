export const PLAN_CONFIG = {
  SINGLE: {
    maxBranches: 3,
    hasClasses: true,
    hasPayments: false,
  },
} as const;

export type PlanKey = keyof typeof PLAN_CONFIG;
export type PlanConfig = (typeof PLAN_CONFIG)[PlanKey];
