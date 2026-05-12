# Production Manual Script Çalıştırma Notu

Production VPS üzerinde manuel backend script çalıştırmak için aşağıdaki yapı kullanılmalıdır.

## Genel Komut Şablonu

```bash
cd /opt/gym-api/backend

sudo docker run --rm -it \
  --network backend_internal \
  --env-file .env \
  -e NODE_ENV=development \
  -e NPM_CONFIG_PRODUCTION=false \
  -e YOUR_SCRIPT_ENV_VAR='value' \
  -e REVENUECAT_PREMIUM_ENTITLEMENT_ID='premium' \
  -e TS_NODE_TRANSPILE_ONLY=1 \
  -e TS_NODE_COMPILER_OPTIONS='{"module":"NodeNext","moduleResolution":"NodeNext"}' \
  -v "$PWD":/app \
  -v /app/node_modules \
  -w /app \
  node:22-alpine \
  sh -lc 'npm ci --include=dev && npx prisma generate && npm exec --yes --package ts-node@10.9.2 --package typescript -- ts-node scripts/YOUR_SCRIPT_NAME.ts'
```

---

## Apple Review Hesabı Oluşturma

**Script:** `scripts/create-reviewer-account.ts`

**Komut:**

```bash
cd /opt/gym-api/backend

sudo docker run --rm -it \
  --network backend_internal \
  --env-file .env \
  -e NODE_ENV=development \
  -e NPM_CONFIG_PRODUCTION=false \
  -e REVIEWER_TEST_PASSWORD='QuuiloGym#AppReview2026!' \
  -e REVENUECAT_PREMIUM_ENTITLEMENT_ID='premium' \
  -e TS_NODE_TRANSPILE_ONLY=1 \
  -e TS_NODE_COMPILER_OPTIONS='{"module":"NodeNext","moduleResolution":"NodeNext"}' \
  -v "$PWD":/app \
  -v /app/node_modules \
  -w /app \
  node:22-alpine \
  sh -lc 'npm ci --include=dev && npx prisma generate && npm exec --yes --package ts-node@10.9.2 --package typescript -- ts-node scripts/create-reviewer-account.ts'
```

---

## Ücretsiz Müşteri Hesabı Oluşturma

**Script:** `scripts/create-free-customer-account.ts`

**Komut:**

```bash
cd /opt/gym-api/backend

sudo docker run --rm -it \
  --network backend_internal \
  --env-file .env \
  -e NODE_ENV=development \
  -e NPM_CONFIG_PRODUCTION=false \
  -e CUSTOMER_INITIAL_PASSWORD='CUSTOMER_PASSWORD_HERE' \
  -e REVENUECAT_PREMIUM_ENTITLEMENT_ID='premium' \
  -e TS_NODE_TRANSPILE_ONLY=1 \
  -e TS_NODE_COMPILER_OPTIONS='{"module":"NodeNext","moduleResolution":"NodeNext"}' \
  -v "$PWD":/app \
  -v /app/node_modules \
  -w /app \
  node:22-alpine \
  sh -lc 'npm ci --include=dev && npx prisma generate && npm exec --yes --package ts-node@10.9.2 --package typescript -- ts-node scripts/create-free-customer-account.ts'
```

**Örnek:**

```bash
cd /opt/gym-api/backend

sudo docker run --rm -it \
  --network backend_internal \
  --env-file .env \
  -e NODE_ENV=development \
  -e NPM_CONFIG_PRODUCTION=false \
  -e CUSTOMER_INITIAL_PASSWORD='zeyneplatin01+' \
  -e REVENUECAT_PREMIUM_ENTITLEMENT_ID='premium' \
  -e TS_NODE_TRANSPILE_ONLY=1 \
  -e TS_NODE_COMPILER_OPTIONS='{"module":"NodeNext","moduleResolution":"NodeNext"}' \
  -v "$PWD":/app \
  -v /app/node_modules \
  -w /app \
  node:22-alpine \
  sh -lc 'npm ci --include=dev && npx prisma generate && npm exec --yes --package ts-node@10.9.2 --package typescript -- ts-node scripts/create-free-customer-account.ts'
```

---

## Script Sonrası DB Kontrolü

DB içine gir:

```bash
sudo docker exec -it gym_api_db psql -U gym_api -d gym_api
```

**User kontrolü:**

```sql
SELECT id, email, "tenantId", "createdAt", "isActive", "emailVerifiedAt"
FROM "User"
WHERE email = 'CUSTOMER_EMAIL_HERE';
```

**Tenant kontrolü:**

```sql
SELECT id, name, slug, "billingStatus", "createdAt"
FROM "Tenant"
WHERE slug = 'TENANT_SLUG_HERE';
```

**RevenueCat entitlement kontrolü:**

```sql
SELECT id, "tenantId", "appUserId", "entitlementId", "isActive", "expiresAt", "createdAt"
FROM "RevenueCatEntitlementSnapshot"
ORDER BY "createdAt" DESC;
```

DB çıkış:

```
\q
```

---

## Backend Login Testi

```bash
curl -i -sS -X POST https://gym-api.quuilo.com/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"CUSTOMER_EMAIL_HERE","password":"CUSTOMER_PASSWORD_HERE"}'
```

**Beklenen sonuç:** `HTTP/2 201`

Response içinde şunlar gelmeli:

```json
{
  "accessToken": "...",
  "user": {
    "email": "CUSTOMER_EMAIL_HERE"
  },
  "tenant": {
    "billingStatus": "ACTIVE"
  }
}
```

**Örnek Login Testi:**

```bash
curl -i -sS -X POST https://gym-api.quuilo.com/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"CUSTOMER_EMAIL_HERE","password":"CUSTOMER_PASSWORD_HERE"}'
```
