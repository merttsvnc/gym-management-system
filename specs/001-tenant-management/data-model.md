# Data Model: Tenant Management

**Version:** 1.0.0  
**Date:** 2025-12-04  
**Status:** Design Complete

---

## Overview

This document defines the data model for the Tenant Management module, including entities, relationships, validation rules, and state transitions.

---

## Entity: Tenant

### Purpose
Represents a gym business account within the SaaS platform. Each tenant is a completely isolated entity with its own data, users, members, and configuration.

### Fields

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `id` | String (CUID) | PRIMARY KEY | Unique identifier |
| `name` | String | NOT NULL, 3-100 chars | Gym business name (e.g., "FitLife Gyms") |
| `slug` | String | UNIQUE, NOT NULL | URL-friendly identifier (e.g., "fitlife-gyms") |
| `defaultCurrency` | String | NOT NULL, ISO 4217 | Default currency for financial operations |
| `createdAt` | DateTime | NOT NULL, AUTO | Timestamp of tenant creation |
| `updatedAt` | DateTime | NOT NULL, AUTO | Timestamp of last update |

### Validation Rules

**name:**
- Minimum length: 3 characters
- Maximum length: 100 characters
- Allowed characters: Alphanumeric and spaces
- Required on creation (handled by Onboarding module)
- Optional on update

**slug:**
- Minimum length: 3 characters
- Maximum length: 100 characters
- Pattern: lowercase alphanumeric with hyphens
- Generated from name during onboarding
- Unique across all tenants
- Immutable after creation (no updates allowed)

**defaultCurrency:**
- Must be valid ISO 4217 code
- Supported currencies: USD, EUR, GBP, CAD, AUD, JPY, CNY, INR, BRL, MXN, ZAR, TRY, SGD, HKD, NZD
- Default: "USD"
- Changes do not retroactively affect existing financial records

### Relationships

```
Tenant 1 ──< many Branch
Tenant 1 ──< many User
```

- A Tenant MUST have at least one Branch
- A Tenant CAN have multiple Branches
- A Tenant MUST have at least one ADMIN User

### Indexes

```sql
PRIMARY KEY (id)
UNIQUE INDEX (slug)
INDEX (slug) -- For login lookup by slug
```

### Business Rules

1. **Creation:** Handled by Onboarding module (out of scope for this feature)
2. **Minimum Branch Requirement:** Tenant must always have at least one active branch
3. **Tenant Isolation:** All queries must be scoped to tenantId
4. **Slug Immutability:** Slug cannot be changed after creation to avoid breaking references

---

## Entity: Branch

### Purpose
Represents a physical gym location belonging to a Tenant. Each branch has its own address and operational context.

### Fields

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `id` | String (CUID) | PRIMARY KEY | Unique identifier |
| `tenantId` | String (CUID) | FOREIGN KEY, NOT NULL | Reference to owning tenant |
| `name` | String | NOT NULL, 2-100 chars | Branch name (e.g., "Downtown Location") |
| `address` | String | NOT NULL, 5-300 chars | Physical address (free-form text) |
| `isDefault` | Boolean | NOT NULL, DEFAULT false | True for the default branch (exactly one per tenant) |
| `isActive` | Boolean | NOT NULL, DEFAULT true | False if archived/soft-deleted |
| `createdAt` | DateTime | NOT NULL, AUTO | Timestamp of branch creation |
| `updatedAt` | DateTime | NOT NULL, AUTO | Timestamp of last update |
| `archivedAt` | DateTime | NULLABLE | Timestamp of archival (null if active) |

### Validation Rules

**name:**
- Minimum length: 2 characters
- Maximum length: 100 characters
- Allowed characters: Alphanumeric, spaces, hyphens (-), apostrophes ('), ampersands (&)
- Pattern: `^[a-zA-Z0-9 '\-&]+$`
- Examples: "Downtown Location", "O'Brien's Gym", "East & West Location"
- Must be unique within tenant (case-insensitive)
- Can be duplicated across different tenants

**address:**
- Minimum length: 5 characters
- Maximum length: 300 characters
- Free-form text to support international address formats
- No character restrictions

**isDefault:**
- Exactly one branch per tenant must have `isDefault = true`
- Setting a new default automatically unsets the previous default
- Archived branches cannot be set as default

**isActive:**
- True by default on creation
- Set to false when branch is archived
- Archived branches excluded from standard listings

**archivedAt:**
- Null for active branches
- Set to current timestamp when archived
- Set back to null when restored

### Relationships

```
Branch many ──< 1 Tenant
Branch 1 ──< many Member (future module)
Branch 1 ──< many CheckIn (future module)
```

### Indexes

```sql
PRIMARY KEY (id)
UNIQUE INDEX (tenantId, name) -- Branch name uniqueness within tenant
FOREIGN KEY INDEX (tenantId) -- For tenant-scoped queries
COMPOSITE INDEX (tenantId, isActive) -- For listing active branches
COMPOSITE INDEX (tenantId, isDefault) -- For quick default branch lookup
```

### State Transitions

```
[Created] → isActive: true, isDefault: false (or true if first branch), archivedAt: null
    ↓
[Set as Default] → isDefault: true (previous default set to false)
    ↓
[Active] → isActive: true, archivedAt: null
    ↓
[Archived] → isActive: false, archivedAt: NOW()
    ↓
[Restored] → isActive: true, archivedAt: null
```

### Business Rules

1. **Creation:** 
   - First branch created for a tenant is automatically marked as default
   - New branches are active by default

2. **Default Branch:**
   - Exactly one branch per tenant must be default
   - Setting a new default unsets the previous default
   - Cannot set an archived branch as default
   - Cannot archive the current default branch without first setting a new default (two-step process)

3. **Archival:**
   - Cannot archive the last active branch of a tenant
   - Cannot archive the current default branch (must set new default first)
   - Archived branches excluded from standard listings (unless explicitly requested)
   - Historical data (members, check-ins) remains intact
   - Archived branches cannot be used for new operations

4. **Restoration:**
   - Can only restore branches that are archived (`isActive: false`)
   - Sets `isActive: true` and `archivedAt: null`
   - Does not automatically become default (must be explicitly set)

5. **Uniqueness:**
   - Branch names must be unique within a tenant (case-insensitive)
   - Branch names can be duplicated across different tenants

---

## Entity: User

### Purpose
Represents an authenticated user who can access the system. In this module, only ADMIN role is implemented.

### Fields

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `id` | String (CUID) | PRIMARY KEY | Unique identifier |
| `tenantId` | String (CUID) | FOREIGN KEY, NOT NULL | Reference to tenant |
| `email` | String | UNIQUE, NOT NULL | Login email address |
| `passwordHash` | String | NOT NULL | Bcrypt hashed password |
| `firstName` | String | NOT NULL | User's first name |
| `lastName` | String | NOT NULL | User's last name |
| `role` | Enum (Role) | NOT NULL, DEFAULT ADMIN | User's role |
| `createdAt` | DateTime | NOT NULL, AUTO | Timestamp of user creation |
| `updatedAt` | DateTime | NOT NULL, AUTO | Timestamp of last update |

**Note:** The spec uses `password` for readability, but implementation uses `passwordHash` to make it explicit that this field stores a hashed value, not plaintext.

### Validation Rules

**email:**
- Must be valid email format
- Unique across all tenants
- Case-insensitive comparison

**passwordHash:**
- Must be bcrypt hash (60 characters)
- Never exposed in API responses
- Never logged

**firstName / lastName:**
- Minimum length: 1 character
- Maximum length: 100 characters

**role:**
- Currently only ADMIN supported
- Future roles: OWNER, STAFF, TRAINER, ACCOUNTANT

### Relationships

```
User many ──< 1 Tenant
```

- A User belongs to exactly one Tenant
- A User can access all data within their Tenant

### Indexes

```sql
PRIMARY KEY (id)
UNIQUE INDEX (email)
FOREIGN KEY INDEX (tenantId)
INDEX (tenantId) -- For tenant-scoped user queries
```

### Business Rules

1. **Creation:** Handled by User Management module (out of scope)
2. **Tenant Context:** User's tenantId used for all tenant-scoped queries
3. **Role-Based Access:** ADMIN can access all tenant data
4. **Single Tenant:** Users cannot switch between tenants (multi-tenant admin tools future enhancement)

---

## Enum: Role

### Values

```typescript
enum Role {
  ADMIN = 'ADMIN'
  // Future roles:
  // OWNER = 'OWNER'
  // STAFF = 'STAFF'
  // TRAINER = 'TRAINER'
  // ACCOUNTANT = 'ACCOUNTANT'
}
```

### Permissions (Current)

**ADMIN:**
- Full access to tenant settings (read and update)
- Full access to branch management (create, read, update, archive, restore)
- Can view and modify all data within their tenant
- Cannot access other tenants' data

**Future Role Design:**
- OWNER: Same as ADMIN + billing/subscription management
- STAFF: Read-only access to branches, limited member operations
- TRAINER: Read-only access to own branch only
- ACCOUNTANT: Financial reports, read-only access

---

## Relationships Diagram

```
┌──────────────────┐
│     Tenant       │
│ (Gym Business)   │
│                  │
│ • id (PK)        │
│ • name           │
│ • slug (UNIQUE)  │
│ • defaultCurrency│
└────────┬─────────┘
         │
         │ 1
         │
         ├─────────────────────────────┐
         │                             │
         │ many                        │ many
         ↓                             ↓
┌────────────────┐            ┌───────────────┐
│    Branch      │            │     User      │
│  (Location)    │            │   (ADMIN)     │
│                │            │               │
│ • id (PK)      │            │ • id (PK)     │
│ • tenantId (FK)│            │ • tenantId(FK)│
│ • name         │            │ • email       │
│ • address      │            │ • passwordHash│
│ • isDefault    │            │ • firstName   │
│ • isActive     │            │ • lastName    │
│ • archivedAt   │            │ • role        │
└────────────────┘            └───────────────┘
         │
         │ 1
         │
         │ many (future)
         ↓
┌────────────────┐
│    Member      │
│  (Future)      │
└────────────────┘
```

---

## Prisma Schema

```prisma
// Tenant model
model Tenant {
  id              String   @id @default(cuid())
  name            String
  slug            String   @unique
  defaultCurrency String   @default("USD")
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  // Relations
  branches        Branch[]
  users           User[]

  @@index([slug])
}

// Branch model
model Branch {
  id         String    @id @default(cuid())
  tenantId   String
  name       String
  address    String
  isDefault  Boolean   @default(false)
  isActive   Boolean   @default(true)
  createdAt  DateTime  @default(now())
  updatedAt  DateTime  @updatedAt
  archivedAt DateTime?

  // Relations
  tenant     Tenant    @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@unique([tenantId, name])
  @@index([tenantId])
  @@index([tenantId, isActive])
  @@index([tenantId, isDefault])
}

// User model
model User {
  id           String   @id @default(cuid())
  tenantId     String
  email        String   @unique
  passwordHash String
  firstName    String
  lastName     String
  role         Role     @default(ADMIN)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  // Relations
  tenant       Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@index([tenantId])
  @@index([email])
}

// Role enum
enum Role {
  ADMIN
  // Future: OWNER, STAFF, TRAINER, ACCOUNTANT
}
```

---

## Migration Strategy

### Initial Migration

**Creates:**
- `Tenant` table with indexes
- `Branch` table with indexes and foreign keys
- `User` table (if not exists) with tenantId and indexes
- `Role` enum

**Constraints:**
- Foreign keys with CASCADE delete (deleting tenant deletes branches and users)
- Unique constraints on `Tenant.slug` and `(Branch.tenantId, Branch.name)`
- NOT NULL constraints on required fields
- Default values for `isDefault`, `isActive`, `defaultCurrency`

**Safety:**
- First migration, no backward compatibility concerns
- Rollback: Drop tables in reverse order (User, Branch, Tenant)

### Seed Data (Development Only)

```typescript
// seed.ts
const demoTenant = await prisma.tenant.create({
  data: {
    name: 'Demo Gym',
    slug: 'demo-gym',
    defaultCurrency: 'USD',
  },
});

const mainBranch = await prisma.branch.create({
  data: {
    tenantId: demoTenant.id,
    name: 'Main Branch',
    address: '123 Fitness St, New York, NY 10001',
    isDefault: true,
    isActive: true,
  },
});

const adminUser = await prisma.user.create({
  data: {
    tenantId: demoTenant.id,
    email: 'admin@demo-gym.com',
    passwordHash: await bcrypt.hash('password123', 10),
    firstName: 'Admin',
    lastName: 'User',
    role: 'ADMIN',
  },
});
```

---

## Query Patterns

### Common Queries

**Get tenant by ID:**
```typescript
await prisma.tenant.findUnique({ where: { id: tenantId } });
```

**Get tenant by slug (login):**
```typescript
await prisma.tenant.findUnique({ where: { slug: 'demo-gym' } });
```

**List active branches for tenant:**
```typescript
await prisma.branch.findMany({
  where: { tenantId, isActive: true },
  orderBy: { name: 'asc' },
  skip: (page - 1) * limit,
  take: limit,
});
```

**Get default branch for tenant:**
```typescript
await prisma.branch.findFirst({
  where: { tenantId, isDefault: true },
});
```

**Check branch name uniqueness:**
```typescript
const existing = await prisma.branch.findUnique({
  where: { tenantId_name: { tenantId, name } },
});
```

**Archive branch:**
```typescript
await prisma.branch.update({
  where: { id: branchId },
  data: { isActive: false, archivedAt: new Date() },
});
```

**Set new default branch:**
```typescript
await prisma.$transaction([
  // Unset old default
  prisma.branch.updateMany({
    where: { tenantId, isDefault: true },
    data: { isDefault: false },
  }),
  // Set new default
  prisma.branch.update({
    where: { id: newDefaultId },
    data: { isDefault: true },
  }),
]);
```

---

## Performance Considerations

### Index Usage
- **Tenant lookup by slug:** Uses unique index on `slug` (login flow)
- **Branch listing:** Uses composite index `(tenantId, isActive)`
- **Default branch:** Uses composite index `(tenantId, isDefault)`
- **Name uniqueness:** Uses unique composite index `(tenantId, name)`

### Expected Load
- 10,000 tenants = 10,000 rows in Tenant table
- Average 3 branches per tenant = 30,000 rows in Branch table
- All queries scoped to tenantId for performance

### N+1 Prevention
- Use Prisma `include` to fetch relations in single query
- Example: Fetching tenant with branches in one query
  ```typescript
  await prisma.tenant.findUnique({
    where: { id: tenantId },
    include: { branches: { where: { isActive: true } } },
  });
  ```

---

**End of Data Model Document**

