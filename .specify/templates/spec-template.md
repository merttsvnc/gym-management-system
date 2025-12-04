# Feature Specification: [FEATURE_NAME]

**Version:** 1.0.0  
**Author:** [AUTHOR_NAME]  
**Date:** [DATE]  
**Status:** Draft | Under Review | Approved | Implemented  

---

## Overview

### Purpose
Brief description of what this feature does and why it's needed.

### Scope
What is included and explicitly what is NOT included in this specification.

### Constitution Alignment
Which constitutional principles does this feature primarily support? How does it align with the project's long-term goals?

---

## Domain Model

### Entities
List new entities or modifications to existing entities.

```typescript
// Example entity structure
interface Entity {
  id: string;
  tenantId: string; // REQUIRED for multi-tenant entities
  // ... other fields
  createdAt: Date;
  updatedAt: Date;
}
```

### Relationships
Describe relationships between entities (one-to-many, many-to-many, etc.)

### Business Rules
Explicit, testable rules that govern this feature:
- Rule 1: [Clear statement with examples]
- Rule 2: [Clear statement with examples]

---

## API Specification

### Endpoints

#### [METHOD] /api/v1/[resource]

**Purpose:** Brief description

**Authorization:** ADMIN (or future roles)

**Request:**
```typescript
interface RequestBody {
  // Type definition
}
```

**Response:**
```typescript
interface ResponseBody {
  // Type definition
}
```

**Status Codes:**
- 200: Success
- 400: Validation error
- 401: Unauthorized
- 403: Forbidden (tenant isolation violation)
- 404: Not found
- 500: Server error

**Validation Rules:**
- Field-level validation requirements

**Error Responses:**
```typescript
interface ErrorResponse {
  statusCode: number;
  message: string;
  errors?: Array<{
    field: string;
    message: string;
  }>;
}
```

---

## Data Model (Prisma Schema)

```prisma
model EntityName {
  id        String   @id @default(cuid())
  tenantId  String   // REQUIRED for tenant scoping
  // ... fields
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  
  @@index([tenantId])
  @@unique([tenantId, uniqueField]) // If business uniqueness is per-tenant
}
```

### Migration Considerations
- Backward compatibility impact
- Data migration requirements
- Index strategy for performance

---

## Frontend Specification

### User Interface

#### Screens/Views
List new screens or modifications to existing screens

#### User Flows
Step-by-step user interactions for key workflows

#### Components
New reusable components needed (use shadcn/ui where possible)

### State Management
How will frontend state be managed? What data needs to be cached/synchronized?

### Performance Considerations
- Loading states
- Optimistic updates
- Pagination requirements

---

## Security & Tenant Isolation

### Tenant Scoping
How is tenant isolation enforced in:
- Database queries?
- API endpoints?
- UI state?

### Authorization
Which roles can access this feature? (Current: ADMIN; Future: OWNER, STAFF, etc.)

### Data Sensitivity
Any PII or sensitive data? Logging restrictions?

---

## Testing Requirements

### Unit Tests
Critical domain logic that MUST have unit tests:
- [ ] Business rule 1
- [ ] Business rule 2

### Integration Tests
API endpoints and flows that MUST have integration tests:
- [ ] Endpoint 1 happy path
- [ ] Endpoint 1 validation errors
- [ ] Tenant isolation verification

### Edge Cases
Known edge cases to test:
- [ ] Edge case 1
- [ ] Edge case 2

---

## Performance & Scalability

### Expected Load
- Typical usage patterns
- Data volume expectations

### Database Indexes
Required indexes for performance:
- [ ] Index 1: Purpose
- [ ] Index 2: Purpose

### Query Optimization
Any N+1 query concerns? How are relations loaded efficiently?

---

## Implementation Checklist

### Backend
- [ ] Domain entities created/updated
- [ ] Service layer implemented
- [ ] Prisma schema updated
- [ ] Migration created and reviewed
- [ ] Controllers implemented (HTTP only, no business logic)
- [ ] Validation DTOs created
- [ ] Unit tests written
- [ ] Integration tests written

### Frontend
- [ ] Shared TypeScript types updated
- [ ] API client methods created
- [ ] UI components implemented
- [ ] State management implemented
- [ ] Loading/error states handled
- [ ] Responsive design verified
- [ ] Accessibility checked (keyboard nav, labels, focus states)

### Documentation
- [ ] API documentation updated
- [ ] README updated (if user-facing feature)
- [ ] Inline code comments for complex logic

---

## Open Questions

List any unresolved questions or decisions pending:
- [ ] Question 1
- [ ] Question 2

---

## Future Enhancements

Features or improvements intentionally deferred:
- Enhancement 1: Why deferred?
- Enhancement 2: Why deferred?

---

**Approval**

- [ ] Domain model reviewed and approved
- [ ] API design reviewed and approved
- [ ] Security implications reviewed
- [ ] Performance implications reviewed
- [ ] Ready for implementation

---

**End of Specification**
