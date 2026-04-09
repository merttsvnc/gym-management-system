-- Monotonic webhook application: skip snapshot writes when an older event arrives after a newer one.

ALTER TABLE "RevenueCatEntitlementSnapshot"
ADD COLUMN "lastAppliedEventAt" TIMESTAMP(3);

ALTER TABLE "RevenueCatSubscriptionSnapshot"
ADD COLUMN "lastAppliedEventAt" TIMESTAMP(3);
