---
description: Create or update a feature specification following constitutional principles and using the spec template.
handoffs: 
  - label: Create Implementation Plan
    agent: speckit.plan
    prompt: Create an implementation plan for this specification. The spec is...
---

## User Input

```text
$ARGUMENTS
```

You **MUST** consider the user input before proceeding (if not empty).

## Outline

You are creating or updating a feature specification at `.specify/specs/[feature-name].md`. This specification will be the source of truth for implementing the feature.

Follow this execution flow:

1. **Load Constitution & Templates**
   - Read `.specify/memory/constitution.md` to understand project principles
   - Read `.specify/templates/spec-template.md` for the specification structure
   - Ensure your output follows constitutional requirements

2. **Gather Requirements**
   - If user input provides requirements, use them
   - Otherwise, ask clarifying questions about:
     - Feature purpose and user value
     - Affected entities and business rules
     - API endpoints needed
     - UI/UX requirements
     - Security and tenant isolation concerns
   - Review existing codebase to understand current architecture and patterns

3. **Constitution Alignment Check**
   - Verify the feature aligns with core constitutional principles:
     - Does it maintain long-term maintainability?
     - Does it enforce tenant isolation?
     - Are business rules explicit and testable?
     - Does it follow the layered architecture?
     - Is security prioritized?

4. **Draft the Specification**
   Use the spec template structure and fill in:
   
   **Overview Section:**
   - Clear purpose statement
   - Explicit scope (what IS and IS NOT included)
   - Constitutional alignment explanation
   
   **Domain Model Section:**
   - Entity definitions with TypeScript interfaces
   - Ensure `tenantId` on all tenant-scoped entities
   - Relationships between entities
   - Explicit, testable business rules
   
   **API Specification Section:**
   - RESTful endpoints under `/api/v1`
   - Request/response TypeScript types
   - Validation rules
   - Error response formats
   - Status codes with clear meanings
   
   **Data Model Section:**
   - Prisma schema additions/modifications
   - Index strategy for performance
   - Migration considerations (backward compatibility)
   - Tenant isolation enforcement via schema
   
   **Frontend Specification Section:**
   - User flows for key tasks
   - UI components needed (prefer shadcn/ui)
   - State management approach
   - Loading states and error handling
   - Accessibility requirements
   
   **Security & Tenant Isolation Section:**
   - How tenant scoping is enforced at each layer
   - Authorization requirements (current: ADMIN)
   - Sensitive data handling
   
   **Testing Requirements Section:**
   - Critical domain logic unit tests
   - API integration tests
   - Edge cases to cover
   
   **Performance & Scalability Section:**
   - Expected load and data volume
   - Required database indexes
   - Query optimization strategies

5. **Review Checklist**
   Before finalizing, verify:
   - [ ] All template sections are filled with concrete details
   - [ ] No `[PLACEHOLDER]` tokens remain unexplained
   - [ ] Business rules are explicit and testable
   - [ ] Tenant isolation is enforced at DB and application layers
   - [ ] API contracts use TypeScript types
   - [ ] Migration strategy considers backward compatibility
   - [ ] Security implications are documented
   - [ ] Testing requirements are specific and actionable
   - [ ] UI/UX supports fast daily workflows (constitutional principle)

6. **Determine File Path**
   - Use kebab-case for filename: `.specify/specs/[feature-name].md`
   - If updating existing spec, read it first and preserve version history
   - Increment version if updating (patch for clarifications, minor for additions, major for breaking changes)

7. **Write the Specification**
   - Write to `.specify/specs/[feature-name].md`
   - If this is a new spec, set version to 1.0.0 and status to "Draft"
   - If updating, increment version and update status

8. **Output Summary**
   Provide the user with:
   - Specification file path
   - Version number
   - Key decisions made
   - Any open questions that need stakeholder input
   - Suggested next step: "Ready to create implementation plan? Use /speckit.plan"

## Validation Rules

- Business rules MUST be explicit, not vague ("should be valid" → "must be between 1 and 100")
- All tenant-scoped entities MUST include `tenantId` in schema and queries
- API endpoints MUST follow REST conventions and versioning
- Error responses MUST be structured consistently
- Performance considerations MUST include index strategy
- Testing requirements MUST be specific and actionable

## Quality Standards

- Use clear, professional language
- Prefer explicit over implicit
- Include examples where helpful (especially for business rules)
- Keep technical jargon minimal; make it readable by non-developers
- Format TypeScript code blocks correctly

## Notes

- The spec is a living document; it can be updated as requirements evolve
- Significant changes should increment the version number
- If implementation deviates from spec, update the spec to reflect reality
- Always prioritize constitutional principles over feature convenience

--- End Command ---

