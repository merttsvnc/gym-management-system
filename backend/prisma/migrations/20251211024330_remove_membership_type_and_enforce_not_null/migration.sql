-- Step 1: Ensure all members have membershipPlanId (run data migration if not already done)
-- This ensures data migration has completed before we enforce NOT NULL
DO $$
DECLARE
    tenant_record RECORD;
    membership_type_record RECORD;
    plan_id TEXT;
    default_currency TEXT;
    members_without_plan INTEGER;
BEGIN
    -- Check if there are members without plans
    SELECT COUNT(*) INTO members_without_plan
    FROM "Member"
    WHERE "membershipPlanId" IS NULL
    AND "membershipType" IS NOT NULL
    AND TRIM("membershipType") != '';
    
    -- If there are members without plans, run data migration
    IF members_without_plan > 0 THEN
        -- Loop through all tenants
        FOR tenant_record IN SELECT id, name, "defaultCurrency" FROM "Tenant" LOOP
            -- Get default currency for tenant, fallback to TRY
            default_currency := COALESCE(tenant_record."defaultCurrency", 'TRY');
            
            -- Loop through unique membershipType values for this tenant
            FOR membership_type_record IN 
                SELECT DISTINCT "membershipType" 
                FROM "Member" 
                WHERE "tenantId" = tenant_record.id 
                AND "membershipType" IS NOT NULL 
                AND TRIM("membershipType") != ''
                AND "membershipPlanId" IS NULL
            LOOP
                -- Check if plan already exists
                SELECT id INTO plan_id
                FROM "MembershipPlan"
                WHERE "tenantId" = tenant_record.id
                AND "name" = TRIM(membership_type_record."membershipType");
                
                -- Create plan if it doesn't exist
                IF plan_id IS NULL THEN
                    INSERT INTO "MembershipPlan" (
                        id, "tenantId", name, description, "durationType", "durationValue", 
                        price, currency, "maxFreezeDays", "autoRenew", status, "sortOrder", 
                        "createdAt", "updatedAt"
                    ) VALUES (
                        gen_random_uuid()::text || '-' || extract(epoch from now())::text,
                        tenant_record.id,
                        TRIM(membership_type_record."membershipType"),
                        'Migrated from membershipType: ' || TRIM(membership_type_record."membershipType"),
                        'MONTHS',
                        12,
                        0,
                        default_currency,
                        NULL,
                        false,
                        'ACTIVE',
                        NULL,
                        NOW(),
                        NOW()
                    ) RETURNING id INTO plan_id;
                END IF;
                
                -- Assign members to this plan
                UPDATE "Member"
                SET 
                    "membershipPlanId" = plan_id,
                    "membershipPriceAtPurchase" = 0
                WHERE 
                    "tenantId" = tenant_record.id
                    AND "membershipType" = membership_type_record."membershipType"
                    AND "membershipPlanId" IS NULL;
            END LOOP;
        END LOOP;
    END IF;
END $$;

-- Step 2: Ensure all members have membershipStartDate and membershipEndDate
-- Copy from old columns if new columns are NULL
UPDATE "Member" 
SET "membershipStartDate" = "membershipStartAt" 
WHERE "membershipStartDate" IS NULL AND "membershipStartAt" IS NOT NULL;

UPDATE "Member" 
SET "membershipEndDate" = "membershipEndAt" 
WHERE "membershipEndDate" IS NULL AND "membershipEndAt" IS NOT NULL;

-- Step 3: Make membershipPlanId NOT NULL
ALTER TABLE "Member" ALTER COLUMN "membershipPlanId" SET NOT NULL;

-- Step 4: Make membershipStartDate NOT NULL
ALTER TABLE "Member" ALTER COLUMN "membershipStartDate" SET NOT NULL;

-- Step 5: Make membershipEndDate NOT NULL
ALTER TABLE "Member" ALTER COLUMN "membershipEndDate" SET NOT NULL;

-- Step 6: Remove old columns
ALTER TABLE "Member" DROP COLUMN "membershipType";
ALTER TABLE "Member" DROP COLUMN "membershipStartAt";
ALTER TABLE "Member" DROP COLUMN "membershipEndAt";
