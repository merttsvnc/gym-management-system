-- Data migration: Create plans from existing membershipType values and assign members
-- This is idempotent - it will skip plans that already exist
DO $$
DECLARE
    tenant_record RECORD;
    membership_type_record RECORD;
    plan_id TEXT;
    default_currency TEXT;
BEGIN
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
        LOOP
            -- Check if plan already exists (idempotent)
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
            
            -- Assign members to this plan (only those not already assigned)
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
END $$;

