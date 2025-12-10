# Feature Specification: Member Management (Üye Yönetimi)

**Version:** 1.0.0  
**Author:** System Architect  
**Date:** 2025-01-20  
**Status:** Draft

---

## Overview

### Purpose

The Member Management module enables gym administrators to manage members (Üyeler) within their gym business. This module provides comprehensive member lifecycle management including member registration, profile updates, membership tracking, and status management. Members are scoped to both a tenant (gym business) and a branch (physical location), ensuring proper organizational structure and data isolation.

This is a core business feature that enables gyms to track their members, manage memberships, and maintain member information. It serves as the foundation for future features such as check-in systems, payment processing, and class scheduling.

### Scope

**What IS included:**

- Member entity with core profile fields (name, contact info, demographics)
- Membership information tracking (type, start/end dates)
- Member status management (ACTIVE, PAUSED, INACTIVE, ARCHIVED)
- CRUD operations for members (create, read, update, status changes)
- Member listing with filtering (by branch, status, search by name/phone)
- Tenant and branch isolation enforcement
- Computed remaining membership days (derived from dates, not stored)
- Free-text notes field for staff annotations
- Turkish language UI (all user-facing strings)

**What is NOT included:**

- Payment processing and billing integration
- Automatic payment collection
- Check-in system (turnstile, QR codes, RFID)
- Class booking and scheduling
- Advanced analytics and reporting dashboards
- Branch Manager role implementation (designed for future, not implemented)
- Automatic membership expiration handling (manual status changes only)
- Email/SMS notifications
- Member self-service portal

### Constitution Alignment

This feature aligns with multiple constitutional principles:

- **Principle 6 (Multi-Tenant SaaS):** Enforces strict tenant and branch isolation at all layers
- **Principle 1 (Long-Term Maintainability):** Establishes clean member management patterns for future modules
- **Principle 3 (Explicit Domain Rules):** Defines clear member status transitions and membership time handling
- **Principle 5 (Modular Architecture):** Creates reusable member management patterns for check-ins, payments, and classes
- **Principle 9 (Performance & Scalability):** Implements proper indexing and pagination for member queries

---

## Domain Model

### Core Concepts

**What is a Member?**

A Member represents a person who has a membership at a gym. Each member belongs to exactly one Tenant (gym business) and exactly one Branch (physical location). Members have profile information, contact details, membership information, and a status that determines their current relationship with the gym.

**Member Status Semantics:**

- **ACTIVE:** Member is currently active, can check in, and membership time is passing normally. This is the default status for new memberships.
- **PAUSED:** Membership is temporarily frozen. While paused, membership end date effectively "freezes" - days while PAUSED do not count against remaining membership time. When reactivated to ACTIVE, remaining days continue from where they left off.
- **INACTIVE:** Membership period has ended or member has canceled. Member is not currently paying but can be reactivated manually by staff.
- **ARCHIVED:** Member record is archived and should not appear in normal member lists. Used for historical records that should be preserved but hidden from day-to-day operations.

**Membership Time Calculation:**

- `remainingDays` is a computed value, not stored in the database
- Calculated from `membershipStartAt`, `membershipEndAt`, and `status`
- When `status = PAUSED`, the calculation accounts for paused periods
- When `status = ACTIVE`, normal time progression applies
- When `status = INACTIVE` or `ARCHIVED`, remaining days may be 0 or negative

**Assumption about Branch Manager Role:**

This spec assumes that a Branch Manager role will be added in the future. When implemented, Branch Managers will only be able to manage members belonging to their assigned branch. The API design includes branch filtering to support this future requirement, but authorization logic for Branch Manager is deferred to a future module.

### Entities

#### Member

```typescript
interface Member {
  id: string; // CUID primary key
  tenantId: string; // REQUIRED: Tenant this member belongs to
  branchId: string; // REQUIRED: Branch this member belongs to
  
  // Core profile fields
  firstName: string; // Required: Member's first name
  lastName: string; // Required: Member's last name
  gender?: MemberGender; // Optional: Gender (MALE or FEMALE)
  dateOfBirth?: Date; // Optional: Date of birth
  phone: string; // Required: Phone number
  email?: string; // Optional: Email address
  photoUrl?: string; // Optional: Profile picture URL (simple string reference in MVP; actual file upload pipeline will be implemented in a future module)
  
  // Membership information
  membershipType: string; // Membership type: "Basic", "Standard", "Premium", or custom text (if Custom option selected)
  membershipStartAt: Date; // Start date of membership
  membershipEndAt: Date; // End date of membership
  
  // Status
  status: MemberStatus; // Current member status (ACTIVE, PAUSED, INACTIVE, ARCHIVED)
  
  // Notes
  notes?: string; // Free-text field for staff notes (goals, health notes, trainer comments)
  
  // Timestamps
  createdAt: Date; // When member record was created
  updatedAt: Date; // When member record was last updated
  
  // Computed fields (not stored, returned in API)
  remainingDays?: number; // Computed remaining membership days
}

enum MemberStatus {
  ACTIVE = "ACTIVE",
  PAUSED = "PAUSED",
  INACTIVE = "INACTIVE",
  ARCHIVED = "ARCHIVED"
}

enum MemberGender {
  MALE = "MALE",
  FEMALE = "FEMALE"
}
```

### Relationships

```
Tenant (1) ──< (many) Member
Branch (1) ──< (many) Member
```

- A Member MUST belong to exactly one Tenant
- A Member MUST belong to exactly one Branch
- A Branch MUST belong to exactly one Tenant (enforced by existing Branch model)
- Therefore, a Member's branch implicitly scopes them to a tenant

### Business Rules

1. **Tenant and Branch Isolation (CRITICAL):**
   - All member queries MUST filter by `tenantId` automatically
   - All member queries MUST filter by `branchId` when branch context is available
   - No API endpoint or database query may cross tenant boundaries
   - Attempting to access a member from another tenant results in 403 Forbidden
   - Attempting to access a member from another branch (when branch context is enforced) results in 403 Forbidden

2. **Required Fields:**
   - `firstName`, `lastName`, `phone`, and `branchId` are required when creating a member
   - `tenantId` is automatically set from authenticated user's tenant context

3. **Member Status Transitions:**
   - New members default to `ACTIVE` status
   - Valid transitions:
     - ACTIVE → PAUSED (freeze membership)
     - ACTIVE → INACTIVE (end membership)
     - ACTIVE → ARCHIVED (archive member)
     - PAUSED → ACTIVE (resume membership)
     - PAUSED → INACTIVE (end membership)
     - PAUSED → ARCHIVED (archive member)
     - INACTIVE → ACTIVE (reactivate membership)
     - INACTIVE → ARCHIVED (archive member)
   - ARCHIVED status is terminal (no transitions from ARCHIVED)

4. **Membership Time Calculation:**
   - `remainingDays` is computed on-demand, never stored
   - Calculation formula: `remainingDays = (membershipEndAt - membershipStartAt) - (days elapsed while ACTIVE) - (days elapsed while PAUSED)`
   - Days while `status = PAUSED` do not count against remaining time
   - Pause periods are tracked via `pausedAt` and `resumedAt` timestamps on the Member model
   - When status changes to PAUSED: `pausedAt = NOW()`, `resumedAt = null`
   - When status changes from PAUSED to ACTIVE: `resumedAt = NOW()`, `pausedAt = null`
   - If `membershipEndAt` is in the past and status is ACTIVE, remaining days may be negative
   - Note: This implementation supports one pause cycle per member. Multiple pauses require reactivation between cycles.

5. **Branch Validation:**
   - When creating or updating a member, `branchId` must belong to the authenticated user's tenant
   - Attempting to assign a member to a branch from another tenant results in 403 Forbidden

6. **Phone Number Uniqueness:**
   - Phone numbers should be unique within a tenant (enforced at API validation level)
   - When creating a member, check if phone number already exists for another member in the same tenant
   - When updating a member's phone, check if new phone number already exists for a different member in the same tenant
   - If duplicate found, return 400 validation error with Turkish message: "Bu telefon numarası zaten kullanılıyor" (This phone number is already in use)
   - Phone numbers may be duplicated across different tenants
   - Note: No database-level unique constraint to allow flexibility for edge cases (e.g., family members sharing phone, temporary data issues)

7. **Archive Behavior:**
   - ARCHIVED members do not appear in default member listings
   - ARCHIVED members can be accessed via explicit ID lookup or with `includeArchived=true` filter
   - Archiving preserves all member data for historical records

---

## Success Criteria

The Member Management module will be considered successful when:

1. **Tenant Isolation:**
   - 100% of member queries enforce tenant isolation (zero cross-tenant data access)
   - All API endpoints return 403 Forbidden when accessing members from different tenants
   - Tenant isolation is verified through automated integration tests

2. **Member Management Operations:**
   - Admins can create new members with required fields in under 30 seconds
   - Member list page loads with filters applied in under 2 seconds for up to 1,000 members
   - Search by name or phone returns results in under 1 second
   - Status changes (ACTIVE ↔ PAUSED ↔ INACTIVE) complete successfully with proper remaining days calculation

3. **Data Integrity:**
   - All member records maintain referential integrity (branchId belongs to tenantId)
   - Remaining days calculation is accurate for all status combinations
   - PAUSED status correctly freezes membership time (no days deducted while paused)

4. **User Experience:**
   - All user-facing text is in Turkish (labels, validation messages, error messages, toasts)
   - Form validation provides clear, actionable error messages in Turkish
   - Member list supports filtering by branch, status, and search without page reload
   - Archive operation requires confirmation to prevent accidental archiving

5. **Performance:**
   - Member list queries with filters complete in under 500ms for typical datasets (up to 1,000 members)
   - Member detail page loads in under 300ms
   - Create/update operations complete in under 1 second

6. **Testing Coverage:**
   - All business rules have unit test coverage (status transitions, remaining days calculation, validation)
   - All API endpoints have integration test coverage (happy paths, error cases, tenant isolation)
   - Edge cases are tested and documented

---

## API Specification

### Endpoints

#### GET /api/v1/members

**Purpose:** List all members for the current tenant with filtering, search, and pagination

**Authorization:** ADMIN (and future roles)

**Query Parameters:**

```typescript
interface MemberListQuery {
  page?: number; // Default: 1
  limit?: number; // Default: 20, Max: 100
  branchId?: string; // Optional: Filter by branch ID
  status?: MemberStatus; // Optional: Filter by status (ACTIVE, PAUSED, INACTIVE, ARCHIVED)
  search?: string; // Optional: Search by firstName, lastName, or phone (partial match)
  includeArchived?: boolean; // Default: false - include ARCHIVED members in results
}
```

**Response:**

```typescript
interface MemberListResponse {
  data: Member[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

interface Member {
  id: string;
  tenantId: string;
  branchId: string;
  firstName: string;
  lastName: string;
  gender?: MemberGender; // MALE or FEMALE
  dateOfBirth?: string; // ISO 8601 date string
  phone: string;
  email?: string;
  photoUrl?: string;
  membershipType: string;
  membershipStartAt: string; // ISO 8601 datetime
  membershipEndAt: string; // ISO 8601 datetime
  status: MemberStatus;
  pausedAt?: string; // ISO 8601 datetime - when member was paused (if currently or previously paused)
  resumedAt?: string; // ISO 8601 datetime - when member was resumed from PAUSED (if previously paused)
  notes?: string;
  remainingDays: number; // Computed value
  createdAt: string; // ISO 8601 datetime
  updatedAt: string; // ISO 8601 datetime
  branch?: { // Optional: Include branch details if requested
    id: string;
    name: string;
  };
}
```

**Status Codes:**

- 200: Success
- 400: Invalid query parameters
- 401: Unauthorized
- 500: Server error

**Search Behavior:**

- `search` parameter searches across `firstName`, `lastName`, and `phone` fields
- Search uses substring matching (contains) - search term can appear anywhere in the field
- Search is case-insensitive
- A member matches if the search term appears in ANY of the three fields (firstName OR lastName OR phone)
- Example: Searching "hme" will match firstName "Ahmet", searching "234" will match phone "+905551234567"
- Single search string only (multiple search terms not supported in MVP)

**Example Response:**

```json
{
  "data": [
    {
      "id": "clx1234567890",
      "tenantId": "clx0987654321",
      "branchId": "clx1111111111",
      "firstName": "Ahmet",
      "lastName": "Yılmaz",
      "gender": "MALE",
      "dateOfBirth": "1990-05-15",
      "phone": "+905551234567",
      "email": "ahmet.yilmaz@example.com",
      "photoUrl": null,
      "membershipType": "Premium",
      "membershipStartAt": "2025-01-01T00:00:00Z",
      "membershipEndAt": "2025-12-31T23:59:59Z",
      "status": "ACTIVE",
      "notes": "Hedef: Kilo verme, haftada 3 kez geliyor",
      "remainingDays": 345,
      "createdAt": "2025-01-01T10:30:00Z",
      "updatedAt": "2025-01-15T14:20:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 1,
    "totalPages": 1
  }
}
```

---

#### GET /api/v1/members/:id

**Purpose:** Get details of a specific member

**Authorization:** ADMIN (and future roles)

**URL Parameters:**

- `id`: Member ID (CUID)

**Response:** Single `Member` object (same structure as in list response)

**Status Codes:**

- 200: Success
- 401: Unauthorized
- 403: Forbidden (member belongs to different tenant)
- 404: Member not found
- 500: Server error

---

#### POST /api/v1/members

**Purpose:** Create a new member for the current tenant

**Authorization:** ADMIN only

**Request:**

```typescript
interface CreateMemberRequest {
  branchId: string; // Required: Branch this member belongs to
  firstName: string; // Required: Member's first name
  lastName: string; // Required: Member's last name
  phone: string; // Required: Phone number
  gender?: MemberGender; // Optional: MALE or FEMALE
  dateOfBirth?: string; // Optional: ISO 8601 date string
  email?: string; // Optional: Email address
  photoUrl?: string; // Optional: Profile picture URL (simple string reference in MVP; actual file upload pipeline will be implemented in a future module)
  membershipType?: string; // Optional: Default "Basic" if not provided
  membershipStartAt?: string; // Optional: ISO 8601 datetime, defaults to current date
  membershipEndAt?: string; // Optional: ISO 8601 datetime, defaults to 1 year from start
  notes?: string; // Optional: Free-text notes
}
```

**Response:** Single `Member` object (201 Created)

**Status Codes:**

- 201: Created successfully
- 400: Validation error (including duplicate phone number)
- 401: Unauthorized
- 403: Forbidden (branch belongs to different tenant or user is not ADMIN)
- 404: Branch not found
- 500: Server error

**Validation Rules:**

- `branchId`: Required, must be valid CUID, must belong to authenticated user's tenant
- `firstName`: Required, 1-50 characters, trim whitespace
- `lastName`: Required, 1-50 characters, trim whitespace
- `phone`: Required, 10-20 characters, validate phone format (international format supported), must be unique within tenant (check against existing members)
- `email`: Optional, must be valid email format if provided
- `gender`: Optional, must be one of: MALE, FEMALE (case-sensitive enum values)
- `dateOfBirth`: Optional, must be valid date, cannot be in the future
- `membershipStartAt`: Optional, must be valid datetime, defaults to current date/time
- `membershipEndAt`: Optional, must be valid datetime, must be after `membershipStartAt`, defaults to 1 year from `membershipStartAt`
- `membershipType`: Optional, defaults to "Basic" if not provided. Must be one of: "Basic", "Standard", "Premium", or any custom string (1-50 characters) if Custom option is used
- `photoUrl`: Optional, must be valid URL if provided
- `notes`: Optional, max 5000 characters

**Error Response (Turkish):**

```typescript
interface ErrorResponse {
  statusCode: number;
  message: string; // Turkish error message
  errors?: Array<{
    field: string;
    message: string; // Turkish validation message
  }>;
}
```

**Example Request:**

```json
{
  "branchId": "clx1111111111",
  "firstName": "Ayşe",
  "lastName": "Demir",
  "phone": "+905559876543",
      "email": "ayse.demir@example.com",
      "gender": "FEMALE",
  "dateOfBirth": "1992-08-20",
  "membershipType": "Premium",
  "membershipStartAt": "2025-01-20T00:00:00Z",
  "membershipEndAt": "2026-01-20T23:59:59Z",
  "notes": "Yeni üye, fitness başlangıç seviyesi"
}
```

**Example Error Response (Turkish):**

```json
{
  "statusCode": 400,
  "message": "Üye oluşturulamadı",
  "errors": [
    {
      "field": "phone",
      "message": "Telefon numarası gereklidir"
    },
    {
      "field": "membershipEndAt",
      "message": "Üyelik bitiş tarihi başlangıç tarihinden sonra olmalıdır"
    }
  ]
}
```

---

#### PATCH /api/v1/members/:id

**Purpose:** Update an existing member

**Authorization:** ADMIN only

**URL Parameters:**

- `id`: Member ID (CUID)

**Request:**

```typescript
interface UpdateMemberRequest {
  branchId?: string; // Optional: Change member's branch
  firstName?: string; // Optional: Update first name
  lastName?: string; // Optional: Update last name
  phone?: string; // Optional: Update phone
  gender?: string; // Optional: Update gender
  dateOfBirth?: string; // Optional: Update date of birth
  email?: string; // Optional: Update email
  photoUrl?: string; // Optional: Update photo URL
  membershipType?: string; // Optional: Update membership type
  membershipStartAt?: string; // Optional: Update membership start date
  membershipEndAt?: string; // Optional: Update membership end date
  notes?: string; // Optional: Update notes
}
```

**Response:** Updated `Member` object

**Status Codes:**

- 200: Success
- 400: Validation error
- 401: Unauthorized
- 403: Forbidden (member belongs to different tenant or user is not ADMIN)
- 404: Member not found
- 500: Server error

**Validation Rules:**

- Same validation rules as create, but all fields are optional
- At least one field must be provided
- If `membershipEndAt` is provided, it must be after `membershipStartAt` (or current `membershipStartAt` if not being updated)
- If `branchId` is provided, new branch must belong to authenticated user's tenant
- If `phone` is provided, must be unique within tenant (check against existing members excluding current member)

---

#### POST /api/v1/members/:id/status

**Purpose:** Change member status (ACTIVE, PAUSED, INACTIVE)

**Authorization:** ADMIN only

**URL Parameters:**

- `id`: Member ID (CUID)

**Request:**

```typescript
interface ChangeMemberStatusRequest {
  status: MemberStatus; // Required: New status (ACTIVE, PAUSED, INACTIVE)
}
```

**Response:** Updated `Member` object

**Status Codes:**

- 200: Success
- 400: Validation error (invalid status transition or invalid status value)
- 401: Unauthorized
- 403: Forbidden (member belongs to different tenant or user is not ADMIN)
- 404: Member not found
- 500: Server error

**Validation Rules:**

- `status`: Required, must be one of: ACTIVE, PAUSED, INACTIVE (ARCHIVED cannot be set via this endpoint)
- Status transition must be valid according to business rules
- Cannot transition from ARCHIVED status (use archive endpoint instead)

**Example Request:**

```json
{
  "status": "PAUSED"
}
```

---

#### POST /api/v1/members/:id/archive

**Purpose:** Archive a member (set status to ARCHIVED)

**Authorization:** ADMIN only

**URL Parameters:**

- `id`: Member ID (CUID)

**Request:** None

**Response:** Updated `Member` object with `status: "ARCHIVED"`

**Status Codes:**

- 200: Success
- 401: Unauthorized
- 403: Forbidden (member belongs to different tenant or user is not ADMIN)
- 404: Member not found
- 500: Server error

**Business Rule:**

- Archiving is a terminal action - archived members cannot be reactivated via status endpoint
- Archived members are preserved for historical records but hidden from normal listings

---

## Data Model (Prisma Schema)

```prisma
model Member {
  id               String       @id @default(cuid())
  tenantId         String
  branchId         String
  
  // Core profile
  firstName        String
  lastName         String
  gender           MemberGender?
  dateOfBirth      DateTime?
  phone            String
  email            String?
  photoUrl         String?
  
  // Membership
  membershipType   String       @default("Basic")
  membershipStartAt DateTime
  membershipEndAt   DateTime
  
  // Status
  status           MemberStatus @default(ACTIVE)
  pausedAt         DateTime?   // Timestamp when member was paused (status = PAUSED)
  resumedAt        DateTime?   // Timestamp when member was resumed from PAUSED to ACTIVE
  
  // Notes
  notes            String?       @db.Text
  
  // Timestamps
  createdAt        DateTime     @default(now())
  updatedAt        DateTime     @updatedAt
  
  // Relations
  tenant           Tenant       @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  branch           Branch       @relation(fields: [branchId], references: [id], onDelete: Restrict)
  
  @@index([tenantId])
  @@index([branchId])
  @@index([tenantId, branchId])
  @@index([tenantId, status])
  @@index([tenantId, firstName, lastName]) // For search
  @@index([tenantId, phone]) // For search
}

enum MemberStatus {
  ACTIVE
  PAUSED
  INACTIVE
  ARCHIVED
}

enum MemberGender {
  MALE
  FEMALE
}
```

### Migration Considerations

- **Backward Compatibility:** This is a new model, no backward compatibility concerns
- **Data Migration:** No existing data to migrate
- **Index Strategy:**
  - `tenantId` index for tenant isolation queries
  - `branchId` index for branch filtering
  - Composite `[tenantId, branchId]` for efficient branch-scoped queries
  - Composite `[tenantId, status]` for status filtering
  - Composite `[tenantId, firstName, lastName]` for name search
  - `[tenantId, phone]` for phone search
- **Foreign Key Constraints:**
  - `tenantId` cascades on delete (if tenant is deleted, members are deleted)
  - `branchId` restricts on delete (cannot delete branch with members - must archive branch first)

---

## Frontend Specification

### User Interface

#### Screens/Views

**Member List Page (`/members`)**

- Displays paginated list of members
- Filter controls:
  - Branch dropdown (filter by branch)
  - Status dropdown (filter by status: ACTIVE, PAUSED, INACTIVE, ARCHIVED)
  - Search input (search by name or phone)
  - Toggle to include/exclude archived members
- Table columns:
  - Photo (thumbnail or placeholder)
  - Full Name (firstName + lastName)
  - Phone
  - Email
  - Branch Name
  - Membership Type
  - Status (with color coding: green=ACTIVE, yellow=PAUSED, gray=INACTIVE, red=ARCHIVED)
  - Remaining Days
  - Actions (View, Edit, Change Status, Archive)
- Actions:
  - "Yeni Üye Ekle" (Add New Member) button
  - Row actions: "Görüntüle" (View), "Düzenle" (Edit), "Durum Değiştir" (Change Status), "Arşivle" (Archive)

**Member Detail Page (`/members/:id`)**

- Displays full member information
- Sections:
  - Profile Information (name, contact, demographics, photo)
  - Membership Information (type, dates, remaining days, status)
  - Notes (editable text area)
- Actions:
  - "Düzenle" (Edit) button
  - "Durum Değiştir" (Change Status) button
  - "Arşivle" (Archive) button

**Create Member Page (`/members/new`)**

- Form with all member fields
- Required fields marked with asterisk
- Branch selector (dropdown of tenant's branches)
- Gender selector (dropdown with options: empty/null, MALE, FEMALE)
- Membership type selector (dropdown with options: Basic, Standard, Premium, Custom)
  - When "Custom" is selected, show text input field below dropdown for custom membership type name
- Date pickers for dateOfBirth, membershipStartAt, membershipEndAt
- Photo upload component (optional)
- Validation errors displayed in Turkish
- "Kaydet" (Save) and "İptal" (Cancel) buttons

**Edit Member Page (`/members/:id/edit`)**

- Same form as create, pre-filled with existing data
- "Kaydet" (Save) and "İptal" (Cancel) buttons

**Change Status Dialog/Modal**

- Dropdown to select new status (ACTIVE, PAUSED, INACTIVE)
- Status transition validation (show error if invalid transition)
- "Değiştir" (Change) and "İptal" (Cancel) buttons

#### User Flows

**Flow 1: Create New Member**

1. Admin navigates to Member List page
2. Clicks "Yeni Üye Ekle" (Add New Member) button
3. Fills in required fields: firstName, lastName, phone, branch
4. Optionally fills in optional fields: email, gender, dateOfBirth, photoUrl, membershipType, dates, notes
   - For membershipType: Select from dropdown (Basic, Standard, Premium) or select "Custom" and enter custom text
5. Clicks "Kaydet" (Save)
6. System validates input (shows Turkish error messages if validation fails)
7. Member is created with ACTIVE status
8. Admin is redirected to Member Detail page
9. Success toast: "Üye başarıyla oluşturuldu" (Member created successfully)

**Flow 2: Search and Filter Members**

1. Admin navigates to Member List page
2. Uses branch filter to show only members from specific branch
3. Uses status filter to show only ACTIVE members
4. Types name or phone in search box
5. List updates in real-time (or on search button click)
6. Results show matching members with pagination

**Flow 3: Change Member Status to PAUSED**

1. Admin navigates to Member List or Member Detail page
2. Clicks "Durum Değiştir" (Change Status) for a member
3. Selects "PAUSED" from status dropdown
4. Clicks "Değiştir" (Change)
5. System validates transition (ACTIVE → PAUSED is valid)
6. Member status is updated to PAUSED
7. Remaining days calculation freezes (days while PAUSED don't count)
8. Success toast: "Üye durumu başarıyla güncellendi" (Member status updated successfully)

**Flow 4: Reactivate Member from PAUSED**

1. Admin navigates to Member Detail page for a PAUSED member
2. Clicks "Durum Değiştir" (Change Status)
3. Selects "ACTIVE" from status dropdown
4. Clicks "Değiştir" (Change)
5. System validates transition (PAUSED → ACTIVE is valid)
6. Member status is updated to ACTIVE
7. Remaining days calculation resumes from where it was paused
8. Success toast: "Üye durumu başarıyla güncellendi"

**Flow 5: Archive Member**

1. Admin navigates to Member Detail page
2. Clicks "Arşivle" (Archive) button
3. Confirmation dialog: "Bu üyeyi arşivlemek istediğinizden emin misiniz?" (Are you sure you want to archive this member?)
4. Admin confirms
5. Member status is set to ARCHIVED
6. Member disappears from default member list
7. Success toast: "Üye başarıyla arşivlendi" (Member archived successfully)

#### Components

**New Reusable Components:**

**MVP Implementation (4 essential components):**
- `MemberList` - Table component for member listing with filters
- `MemberForm` - Form component for create/edit member
- `MemberDetail` - Detail view component with actions
- `StatusChangeDialog` - Modal/dialog for changing member status

**Future Enhancements (optional for MVP):**
- `MemberStatusBadge` - Badge component showing member status with color coding
- `MemberPhoto` - Photo display component with placeholder fallback
- `RemainingDaysDisplay` - Component showing remaining days with visual indicator (e.g., progress bar)
- `ArchiveConfirmDialog` - Confirmation dialog for archiving members
- `MembershipTypeSelector` - Dropdown with Basic/Standard/Premium/Custom options, with conditional text input for Custom

**Use Existing shadcn/ui Components:**

- `Table` - For member list table
- `Input` - For form inputs
- `Select` - For dropdowns (branch, status)
- `Button` - For actions
- `Dialog` - For modals
- `Badge` - For status display
- `Avatar` - For member photos
- `Textarea` - For notes field
- `DatePicker` - For date fields

### State Management

- **Member List State:**
  - Current page, limit, filters (branchId, status, search), includeArchived flag
  - Cached member list data
  - Loading and error states

- **Member Detail State:**
  - Current member data
  - Loading and error states

- **Form State:**
  - Form values, validation errors, dirty state
  - Loading state during submission

- **API Client:**
  - React Query or similar for caching and synchronization
  - Optimistic updates for status changes
  - Cache invalidation on create/update/delete

### Performance Considerations

- **Loading States:**
  - Skeleton loaders for member list table
  - Loading spinner for member detail page
  - Disable form submit button during submission

- **Optimistic Updates:**
  - Status changes update UI immediately
  - Rollback on error with error toast

- **Pagination:**
  - Default 20 items per page
  - Load more or page navigation
  - Virtual scrolling for large lists (future enhancement)

- **Search Debouncing:**
  - Debounce search input (300ms delay)
  - Cancel pending requests on new search

---

## Security & Tenant Isolation

### Tenant Scoping

**Database Level:**

- All queries for `Member` MUST include `WHERE tenantId = ?`
- Use explicit `tenantId` filter in all Prisma queries (service layer)
- Example query pattern:
  ```typescript
  await prisma.member.findMany({
    where: {
      tenantId: currentTenantId,
      // ... other filters
    }
  });
  ```

**Application Level:**

- Extract `tenantId` from JWT in authentication middleware
- Attach `tenantId` to request context (`req.user.tenantId`)
- Service layer methods MUST accept `tenantId` as a parameter
- Enforce tenant scoping in service layer before database queries
- Validate that `branchId` belongs to authenticated user's tenant before creating/updating members

**API Level:**

- All API routes protected by authentication guard
- Tenant context established from JWT token
- Route handlers validate that member `tenantId` matches JWT `tenantId`
- Attempting to access member from different tenant returns 403 Forbidden with Turkish message: "Bu üyeye erişim yetkiniz yok" (You don't have permission to access this member)

**Example Enforcement Flow:**

1. Request arrives with JWT in `Authorization` header
2. Auth middleware validates JWT and extracts `tenantId` and `userId`
3. Request context populated with `req.user = { userId, tenantId, role }`
4. Controller calls service method with `tenantId` from context
5. Service queries database with `tenantId` filter
6. Service validates result belongs to correct tenant before returning
7. If member belongs to different tenant, return 403 Forbidden

### Authorization

**Current Role: ADMIN**

- Full access to member management (create, read, update, change status, archive)
- Can manage members across all branches within their tenant
- Cannot access members from other tenants (enforced by tenant scoping)

**Future Role Design:**

- **Branch Manager** (not implemented in this module):
  - Can only manage members belonging to their assigned branch
  - API filters will automatically scope to their branch
  - Authorization logic deferred to future module

**Authorization Pattern:**

- Authorization logic centralized in service layer
- Role checks performed before database queries
- Future: Policy classes define permissions per role

### Data Sensitivity

- **PII Data:**
  - Members contain PII: name, phone, email, date of birth, photo
  - All PII must be protected at rest and in transit
  - Access logs should not log full PII (log member ID only)

- **Logging Restrictions:**
  - Do not log full member data in application logs
  - Log member ID and action only (e.g., "Member clx1234567890 created")
  - Error logs may include field names but not field values for PII fields

- **Photo Storage:**
  - Photo URLs should point to secure storage (S3, Cloudinary, etc.)
  - Photos should be accessible only to authorized users
  - Consider signed URLs for photo access

---

## Testing Requirements

### Unit Tests

Critical domain logic that MUST have unit tests:

**MVP Scope:**
- [ ] Member status transition validation (valid and invalid transitions)
- [ ] Remaining days calculation (normal progression)
- [ ] Remaining days calculation with PAUSED status (freeze logic using pausedAt/resumedAt timestamps)
- [ ] Remaining days calculation when reactivating from PAUSED (resumedAt timestamp handling)
- [ ] PausedAt timestamp set when status changes to PAUSED
- [ ] ResumedAt timestamp set when status changes from PAUSED to ACTIVE

**Future Scope – MVP includes only critical domain unit tests (freeze logic + core service methods):**
- [ ] Phone number validation (format and uniqueness within tenant)
- [ ] Email validation
- [ ] Gender validation (must be MALE or FEMALE if provided)
- [ ] Date validation (dateOfBirth cannot be future, membershipEndAt must be after membershipStartAt)
- [ ] Membership type validation (must be Basic/Standard/Premium or custom string 1-50 chars)
- [ ] Branch validation (branch must belong to tenant)

### Integration Tests

**MVP Scope:**
- [ ] `GET /api/v1/members` - List members with pagination (smoke test)
- [ ] `GET /api/v1/members/:id` - Get member details (smoke test)
- [ ] `POST /api/v1/members/:id/status` - Change status to PAUSED (freeze logic test)
- [ ] `POST /api/v1/members/:id/status` - Change status to ACTIVE (freeze logic test)
- [ ] Tenant isolation verification (members from Tenant A cannot be accessed by Tenant B user)

**Full integration suite deferred; MVP includes only smoke, status, freeze logic, and tenant isolation tests.**

**Future Scope (Full Integration Test Suite):**
- [ ] `GET /api/v1/members` - Filter by branch
- [ ] `GET /api/v1/members` - Filter by status
- [ ] `GET /api/v1/members` - Search by name (substring match, case-insensitive)
- [ ] `GET /api/v1/members` - Search by phone (substring match)
- [ ] `GET /api/v1/members` - Search matches across firstName OR lastName OR phone
- [ ] `GET /api/v1/members` - Include archived members
- [ ] `GET /api/v1/members/:id` - 403 when accessing member from different tenant
- [ ] `POST /api/v1/members` - Create member with required fields
- [ ] `POST /api/v1/members` - Create member with all fields
- [ ] `POST /api/v1/members` - Validation errors (Turkish messages)
- [ ] `POST /api/v1/members` - Invalid gender value (should return 400 error)
- [ ] `POST /api/v1/members` - Create member with custom membership type
- [ ] `POST /api/v1/members` - Create member with predefined membership type (Basic/Standard/Premium)
- [ ] `POST /api/v1/members` - Duplicate phone number validation (400 error)
- [ ] `POST /api/v1/members` - 403 when branch belongs to different tenant
- [ ] `PATCH /api/v1/members/:id` - Update member fields
- [ ] `PATCH /api/v1/members/:id` - 403 when member belongs to different tenant
- [ ] `POST /api/v1/members/:id/status` - Invalid status transition (400 error)
- [ ] `POST /api/v1/members/:id/archive` - Archive member
- [ ] `POST /api/v1/members/:id/archive` - 403 when member belongs to different tenant

### Edge Cases

Known edge cases to test:

- [ ] Create member with membershipEndAt in the past (should be allowed, remainingDays will be negative)
- [ ] Change status from ACTIVE to PAUSED when membershipEndAt is in the past
- [ ] Change status from PAUSED to ACTIVE when membershipEndAt is in the past
- [ ] Search with special characters in name (should handle gracefully)
- [ ] Search with international phone number formats (substring match should work)
- [ ] Search with empty string (should return all members or handle gracefully)
- [ ] Search with very long string (should handle gracefully or limit length)
- [ ] Pagination with empty result set
- [ ] Pagination beyond total pages
- [ ] Update member with same values (no-op)
- [ ] Archive already archived member (should return 400 or 200 with no change)
- [ ] Create member with very long notes (5000 characters)
- [ ] Update member branchId to different branch (same tenant)
- [ ] Update member branchId to branch from different tenant (should return 403)
- [ ] Create member with duplicate phone number (should return 400 with Turkish error)
- [ ] Update member phone to duplicate phone number (should return 400 with Turkish error)
- [ ] Update member phone to same phone number (should succeed, no error)

---

## Performance & Scalability

### Expected Load

- **Typical Usage Patterns:**
  - Small gym: 50-200 members per branch
  - Medium gym: 200-1000 members per branch
  - Large gym: 1000-5000 members per branch
  - Multi-branch tenant: 2-10 branches

- **Data Volume Expectations:**
  - Average 10,000 members per tenant (across all branches)
  - Peak concurrent users: 10-50 admins per tenant
  - Member list queries: Most common operation, must be fast

- **Query Patterns:**
  - List members (most common): Filtered by branch, status, search
  - Get member detail: Less common, by ID lookup
  - Create/update: Less common, write operations

### Database Indexes

**Full specification (future optimization):**

- [ ] `@@index([tenantId])` - Tenant isolation queries
- [ ] `@@index([branchId])` - Branch filtering
- [ ] `@@index([tenantId, branchId])` - Composite for branch-scoped queries within tenant
- [ ] `@@index([tenantId, status])` - Status filtering within tenant
- [ ] `@@index([tenantId, firstName, lastName])` - Name search within tenant
- [ ] `@@index([tenantId, phone])` - Phone search within tenant

**MVP Implementation:**

The MVP implementation uses only 2 essential indexes:
- `@@index([tenantId, branchId])` - Branch-scoped queries within tenant
- `@@index([tenantId, phone])` - Phone search and uniqueness checks within tenant

The remaining indexes are deferred to a future performance optimization phase.

**Index Strategy:**

- Composite indexes support common query patterns (tenantId + other filters)
- Single-column indexes support individual field filtering
- Consider full-text search index for name/phone search if PostgreSQL is used

### Query Optimization

**N+1 Query Concerns:**

**MVP must include branch relation loading in findAll() to avoid N+1 queries:**

- Member list queries should include branch relation if branch name is needed:
  ```typescript
  await prisma.member.findMany({
    where: { tenantId },
    include: { branch: { select: { id: true, name: true } } }
  });
  ```

- Avoid loading full branch object if only name is needed (use select)

**Pagination Optimization:**

- Use cursor-based pagination for very large datasets (future enhancement)
- Current offset-based pagination is acceptable for MVP (up to 10,000 members)

**Search Optimization:**

- Consider full-text search capabilities if search becomes a bottleneck
- Current LIKE queries are acceptable for MVP
- Index on `[tenantId, firstName, lastName]` and `[tenantId, phone]` supports search

---

## Implementation Checklist

### Backend

- [ ] Domain entities created (`Member` model, `MemberStatus` enum)
- [ ] Service layer implemented (`MembersService` with business logic)
- [ ] Prisma schema updated (`Member` model, `MemberStatus` enum)
- [ ] Migration created and reviewed
- [ ] Controllers implemented (`MembersController` - HTTP only, no business logic)
- [ ] Validation DTOs created (`CreateMemberDto`, `UpdateMemberDto`, `ChangeStatusDto`)
- [ ] Remaining days calculation logic implemented
- [ ] Status transition validation implemented
- [ ] Unit tests written (domain logic, validation, calculations)
- [ ] Integration tests written (API endpoints, tenant isolation)

### Frontend

- [ ] Shared TypeScript types updated (`Member`, `MemberStatus`, API request/response types)
- [ ] API client methods created (`membersApi.list()`, `membersApi.get()`, `membersApi.create()`, etc.)
- [ ] UI components implemented (`MemberList`, `MemberForm`, `MemberStatusBadge`, etc.)
- [ ] State management implemented (React Query or similar)
- [ ] Loading/error states handled (skeletons, error messages in Turkish)
- [ ] Turkish translations added (all user-facing strings)

**Future Enhancements:**
- Responsive layout and accessibility compliance will be handled in a later UI polishing phase, not in MVP.

### Documentation

- [ ] README updated (if user-facing feature)
- [ ] Inline code comments for complex logic (remaining days calculation, status transitions)

**API Documentation:**

Swagger/OpenAPI update is recommended but not required in MVP; will be added after core API stabilizes.

---

## Clarifications

### Session 2025-01-20

- Q: How should PAUSED status freeze logic be implemented? → A: Store `pausedAt` and `resumedAt` timestamps directly on the Member model. This approach supports a single pause cycle per member and simplifies remaining days calculation. When status changes to PAUSED, store `pausedAt = NOW()`. When status changes from PAUSED to ACTIVE, store `resumedAt = NOW()` and clear `pausedAt`. Remaining days calculation: `(membershipEndAt - membershipStartAt) - (days elapsed while ACTIVE) - (days elapsed while PAUSED)`. Note: This approach supports one pause cycle per member. If a member needs to pause multiple times, they would need to be reactivated and then paused again (which would overwrite the previous pause timestamps).

- Q: Should phone number uniqueness be enforced? → A: Enforce uniqueness at API level (validation check). When creating or updating a member, check if the phone number already exists for another member in the same tenant. If duplicate found, return 400 validation error with Turkish message: "Bu telefon numarası zaten kullanılıyor" (This phone number is already in use). Do not enforce at database level (no unique constraint) to allow flexibility for edge cases (e.g., family members sharing phone, temporary data issues).

- Q: Should gender field be free text or predefined values? → A: Use a predefined enum with only two options: "Male" and "Female". Gender field is optional, but if provided, must be one of these two values. UI should use a dropdown/select component with these two options plus an empty/null option for "not specified".

- Q: Should membership type be free text or predefined values? → A: Predefined list with "Basic", "Standard", "Premium" plus a "Custom" option that opens a free-text field. When "Custom" is selected, admin can enter any text value. Default value is "Basic". UI should use a dropdown/select with the three predefined options plus "Custom". When "Custom" is selected, show a text input field below the dropdown for entering custom membership type name. Validation: If "Custom" is selected, the custom text field is required and must be 1-50 characters.

- Q: What exact matching behavior should the search implement? → A: Substring match (contains) - search term can appear anywhere in firstName, lastName, or phone fields. Search is case-insensitive. Example: Searching "hme" will match "Ahmet", searching "234" will match phone "+905551234567". The search checks if the search term appears as a substring in any of the three fields (firstName OR lastName OR phone). Multiple search terms are not supported in MVP (single search string only).

---

## Open Questions

List any unresolved questions or decisions pending:


- [ ] **Photo upload implementation:** The spec includes `photoUrl` field but doesn't specify how photos are uploaded. This will be handled in implementation:
  - Direct file upload to backend vs. pre-signed URL to cloud storage
  - Photo size limits and format restrictions
  - Photo processing (resize, optimize)

---

## Future Enhancements

Features or improvements intentionally deferred:

- **Payment Integration:** Member management is separate from payment processing. Payment module will integrate with members to track payment history and automatically update membership dates.

- **Check-in System:** Full check-in functionality (QR codes, RFID, turnstile integration) is deferred. Member module provides the foundation (member lookup, status validation) for check-in features.

- **Class Booking:** Class scheduling and member class bookings are deferred. Member module provides member data that will be referenced by booking system.

- **Branch Manager Role:** Branch Manager role authorization is designed but not implemented. API supports branch filtering, but role-based access control for Branch Managers is deferred to future authorization module.

- **Advanced Search:** Full-text search, fuzzy matching, and advanced filters (date range, membership type, etc.) are deferred to future enhancement.

- **Member Self-Service Portal:** Member-facing portal for viewing their own information, updating profile, and managing membership is deferred.

- **Bulk Operations:** Bulk import/export, bulk status changes, and bulk updates are deferred to future enhancement.

- **Member History/Audit Log:** Tracking of member status changes, membership updates, and audit trail is deferred to future enhancement.

- **Automatic Membership Expiration:** Automatic status change from ACTIVE to INACTIVE when membershipEndAt passes is deferred. Current implementation requires manual status changes.

- **Email/SMS Notifications:** Notifications for membership expiration, status changes, and reminders are deferred to future notification module.

---

**Approval**

- [ ] Domain model reviewed and approved
- [ ] API design reviewed and approved
- [ ] Security implications reviewed
- [ ] Performance implications reviewed
- [ ] Ready for implementation

---

**End of Specification**
