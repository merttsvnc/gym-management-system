<!--
SYNC IMPACT REPORT
==================
Version: 1.0.0 (Initial Constitution)
Ratification Date: 2025-12-04
Last Amended: 2025-12-04

Change Summary:
- Initial constitution creation for Gym Management System
- 9 core principles established covering all aspects of development
- Multi-tenant SaaS architecture defined
- Security, testing, and quality standards established

Templates Status:
✅ spec-template.md - created and aligned with constitution
✅ plan-template.md - created and aligned with constitution
✅ tasks-template.md - created and aligned with constitution
✅ speckit.constitution.md - command definition created
✅ speckit.specify.md - command definition created
✅ speckit.plan.md - command definition created
✅ speckit.tasks.md - command definition created

Follow-up Actions:
- Set up initial backend project structure (NestJS + Prisma)
- Set up initial frontend project structure (React + Vite + Tailwind)
- Configure CI/CD pipeline per quality gates
- Create initial database schema with tenant model
-->

# Project Constitution: Gym Management System

**Version:** 1.0.0  
**Ratification Date:** 2025-12-04  
**Last Amended:** 2025-12-04  
**Status:** Active

---

## Preamble

This constitution establishes the foundational principles, architectural standards, and governance rules for the **Gym Management System** — a professional-grade, multi-tenant SaaS platform designed for long-term growth and production excellence.

This system is intended as a primary, long-term product that must remain:
- Professional-grade and production-ready
- Secure, multi-tenant, and robust
- Clean, understandable, and easy to maintain
- Designed for future growth (new roles, features, modules)
- Modern, corporate, and pleasant to use for daily operations

All contributors, maintainers, and decision-makers MUST adhere to these principles. Deviations require explicit justification and documented approval.

---

## Core Principles

### Principle 1: Long-Term Maintainability Over Quick Solutions

**Statement:**
Prioritize long-term maintainability over quick hacks. Every design decision, code pattern, and architectural choice MUST consider the impact on future developers and the system's evolution over years, not weeks.

**Rationale:**
This is a primary product intended for sustained growth. Technical debt accumulated early becomes exponentially expensive to resolve later. Code written today will be read, modified, and extended by teams who may not have context about initial decisions.

**Requirements:**
- Avoid shortcuts that sacrifice code clarity or architectural integrity
- Prefer explicit, verbose solutions over clever, obscure ones
- Document non-obvious decisions at the point of implementation
- Refactor proactively when patterns emerge that violate this principle
- Code reviews MUST evaluate maintainability impact

### Principle 2: Simplicity With Non-Negotiable Security and Correctness

**Statement:**
Prefer simplicity, but NEVER at the cost of security or correctness. When trade-offs arise, security and correctness take absolute precedence.

**Rationale:**
A simpler system is easier to maintain, but security vulnerabilities and incorrect business logic destroy user trust and can lead to catastrophic failures in a multi-tenant SaaS environment.

**Requirements:**
- Use established security patterns and libraries, not custom implementations
- All important domain rules MUST be explicit, testable, and documented
- Never bypass validation or authorization checks for convenience
- Fail loudly and safely rather than silently proceeding with undefined behavior
- Security reviews required for authentication, authorization, and tenant isolation code

### Principle 3: Explicit, Testable, Documented Domain Rules

**Statement:**
All important domain rules MUST be explicit, testable, and documented. Business logic cannot be implicit, scattered, or hidden in infrastructure code.

**Rationale:**
The system's value derives from correctly implementing gym management domain rules (subscriptions, check-ins, payments, membership eligibility). These rules will evolve and must be verifiable.

**Requirements:**
- Domain logic lives in dedicated domain/application layers
- Business rules MUST be unit-testable without HTTP or database dependencies
- Critical rules (subscription status, check-in eligibility, tenant scoping) have explicit tests
- Use domain-driven terminology in code (Member, Subscription, CheckIn, Tenant)
- Document complex business rules in `/specs` folder with clear examples

### Principle 4: Approachable Codebase for Future Developers

**Statement:**
The codebase should be approachable for new developers joining later. Consistency is more important than personal style preferences.

**Rationale:**
Team composition will change. Onboarding speed and developer confidence depend on predictable patterns and clear structure.

**Requirements:**
- Enforce consistent code style via ESLint + Prettier (non-negotiable)
- Follow established patterns within the codebase; do not introduce new patterns without team discussion
- Module organization follows clear conventions (feature-based modules in NestJS)
- Use TypeScript strictly; no `any` types except in unavoidable third-party integration points
- README and documentation provide clear setup instructions and architectural overview

### Principle 5: Modular, Layered Architecture with Clear Separation

**Statement:**
Use TypeScript end-to-end (backend + frontend). Follow a modular, layered architecture with clear separation of domain, application, and infrastructure concerns. No business logic in controllers or UI components.

**Rationale:**
Layered architecture enables independent testing, replacement of infrastructure, and clear reasoning about where logic belongs. It prevents the "big ball of mud" anti-pattern.

**Architecture Layers:**

**Backend (NestJS):**
- **Domain Layer:** Core business entities, rules, and interfaces (subscriptions, members, check-ins)
- **Application/Service Layer:** Use cases, orchestration, transaction boundaries
- **Infrastructure Layer:** Database access (Prisma), HTTP controllers, external service adapters

**Frontend (React + Vite):**
- **UI Components:** Presentational components (shadcn/ui + Tailwind)
- **Application Logic:** State management, API client, routing
- **Shared Contracts:** TypeScript types/interfaces shared with backend

**Requirements:**
- Keep modules small, cohesive, and well-named
- Avoid massive "god services" and deeply nested dependencies
- Prefer composition over inheritance
- Use explicit types and interfaces instead of `any`
- Introduce a shared types/contracts module for API contracts used by both backend and frontend
- Controllers MUST only handle HTTP concerns (request validation, response formatting)
- React components MUST only handle presentation and user interaction

### Principle 6: Multi-Tenant SaaS with Strict Tenant Isolation

**Statement:**
The system is a multi-tenant SaaS. Every gym account is a Tenant. Tenant isolation MUST be enforced at both database and application levels. Users can only access data from their tenant.

**Rationale:**
Data leakage between tenants would be catastrophic. Multi-tenancy must be a first-class architectural concern, not an afterthought.

**Requirements:**

**Data Model:**
- Every entity belonging to a gym MUST have a `tenantId` field
- Use database foreign keys and indexes that include `tenantId`
- Queries MUST filter by `tenantId` automatically (use Prisma middleware or query wrappers)

**Authorization:**
- Current role: **ADMIN** (can manage everything for their tenant)
- Future roles anticipated: OWNER, STAFF, TRAINER, ACCOUNTANT
- Role/permission logic MUST be centralized in a policy/authorization layer
- New roles can be added without rewriting large parts of the system

**Authentication:**
- Use secure password hashing (bcrypt or Argon2)
- Use JWT with proper expiry and refresh token strategy
- Never log sensitive data (passwords, tokens, personal info)

**Configuration:**
- Secrets and sensitive values MUST come from environment variables
- Different env files for local/dev/stage/prod
- Never commit secrets to version control

### Principle 7: Backend Data Integrity and Migration Discipline

**Statement:**
Use NestJS with feature modules and dependency injection. Use Prisma for database access with explicit, version-controlled migrations. Enforce data integrity via database constraints.

**Rationale:**
Database is the source of truth. Migrations that are not reproducible or backward compatible cause deployment failures and data inconsistencies.

**Requirements:**

**Migrations:**
- MUST be reproducible and tracked in git
- SHOULD be backward compatible when possible
- MUST be reviewed before running on shared or production environments
- MUST NOT be edited after being merged to main; create a new migration instead

**Data Integrity:**
- Use foreign keys for relationships
- Use unique indexes where business rules require uniqueness
- Use proper enum types, not strings
- Use NOT NULL constraints where data is required
- Default values should be explicit in schema

**Domain Logic:**
- Subscription status, check-in eligibility, tenant scoping logic lives in domain/application layers
- MUST be unit-testable without HTTP or real database
- Use Prisma's generated client types in service layer

**API:**
- RESTful, versioned (e.g., `/api/v1`)
- Consistent naming conventions (plural nouns for resources)
- Standard HTTP status codes (200, 201, 400, 401, 403, 404, 500)
- Clear error structure with human-readable messages for staff/admin users
- Error responses include field-level validation errors when applicable

### Principle 8: Professional, Corporate UI Optimized for Daily Use

**Statement:**
The UI must feel professional, modern, and optimized for daily use by gym staff and admins. Use React + Vite + Tailwind + shadcn/ui. Follow a consistent design system.

**Rationale:**
Staff will use this system every day, many times per day. Poor UX leads to frustration, errors, and resistance to adoption.

**Design Principles:**
- **Fast workflows:** Minimize clicks for common tasks (register member, renew subscription, check-in)
- **Clear status indicators:** Active/expired membership, overdue payments, current branch context
- **Consistent design system:** shadcn/ui + Tailwind with a small, reusable color palette
- **Accessibility:** Semantic HTML, correct labels, focus states, keyboard navigation

**Visual Style:**
- Modern, clean, responsive layouts
- Professional color palette (avoid random colors per page)
- Consistent typography scale
- Subtle, purposeful animations (hover states, transitions)
- Animations MUST NOT block or slow down core workflows

**Performance:**
- Fast initial page load (code splitting, lazy loading)
- Optimistic UI updates for better perceived performance
- Loading states for async operations
- Efficient re-renders (React.memo, useMemo where appropriate)

### Principle 9: Performance, Scalability, and Operational Excellence

**Statement:**
Design for many tenants and thousands of members per tenant. Use indexes and efficient queries. All list endpoints MUST be paginated. Design with horizontal scaling in mind.

**Rationale:**
Growth should not require architectural rewrites. Performance issues discovered late are expensive to fix and harm user experience.

**Requirements:**

**Database Performance:**
- Index columns used in WHERE, JOIN, and ORDER BY clauses
- Optimize for common queries: member search, dashboard counts, subscription status checks
- Avoid N+1 queries; use Prisma relations and proper data loading patterns
- Monitor slow queries and add indexes as needed

**API Performance:**
- All list endpoints paginated by default (limit/offset or cursor-based)
- Response times for common operations < 200ms (excluding network latency)
- Implement caching for read-heavy, rarely-changing data (configuration, plans)

**Scalability:**
- Stateless API servers (no session state on server; use JWT)
- Shared database with connection pooling
- Design allows horizontal scaling of API instances

**Logging & Observability:**
- Log important events: authentication failures, authorization denials, critical errors
- NEVER log sensitive data (passwords, tokens, full credit card numbers)
- Use structured logging (JSON format)
- Include correlation IDs for request tracing
- Design makes adding monitoring and metrics easy later

---

## Quality Standards

### Testing Requirements

**Priorities:**
- Domain logic for subscriptions, check-ins, and tenant isolation
- Critical backend flows: authentication, member management, subscription lifecycle

**Test Types:**
- **Unit Tests:** Pure domain logic, business rules, utilities
- **Integration Tests:** API endpoints, database interactions, authentication flows

**Standards:**
- Tests MUST be deterministic and stable (no flakiness)
- Tests MUST be fast (unit tests < 1s, integration tests < 5s each)
- Critical paths MUST have test coverage
- Tests are documentation; name tests clearly and use arrange-act-assert pattern

### Code Quality Gates

**Linting & Formatting:**
- Enforce ESLint + Prettier with consistent config across backend and frontend
- Code that does not pass lint/format checks MUST NOT be merged
- Use shared config packages to ensure consistency

**Type Safety:**
- TypeScript strict mode enabled
- No `any` types without explicit justification and comment
- Shared types between backend and frontend to prevent contract drift

**CI Pipeline:**
- MUST run tests before merging to main
- MUST run lint/format checks
- MUST build successfully (frontend + backend)
- Optional: type checking, security scanning, dependency audits

---

## Collaboration & Git Workflow

### Branching Model

- **main:** Always deployable, protected branch
- **feature branches:** For new work, named descriptively (e.g., `feature/member-registration`, `fix/subscription-renewal-bug`)

### Pull Requests

- Prefer small, focused PRs (< 400 lines changed when possible)
- Each PR MUST have a clear purpose and description
- Link to related spec or issue if applicable
- Self-review before requesting team review

### Commit Messages

- Use clear, imperative-style messages (e.g., "Add member check-in endpoint")
- Group related changes together in single commits
- Reference issue/spec numbers when applicable

### Code Review

- Significant changes to architecture, domain rules, or security MUST be reviewed carefully
- Reviewers check for: correctness, security, maintainability, test coverage, adherence to constitution
- Feedback should be constructive and reference specific principles when applicable

---

## Documentation & Specification System

### Specification Folder Structure

**`/specs` folder** is the source of truth for:
- Domain model and entity relationships
- API endpoint design and contracts
- Product scope and expected behavior
- Business rules and validation logic

### Documentation Requirements

When implementing a new feature or changing existing behavior:
- First update or create the relevant spec, or do it together with implementation
- API changes MUST be documented in spec before implementation
- Breaking changes require explicit documentation and migration path

### Living Documentation

- The constitution is a **living document**
- Can evolve as the system and team mature
- Changes MUST preserve consistency and overall philosophy
- Constitution amendments follow semantic versioning:
  - **MAJOR:** Backward incompatible governance/principle removals or redefinitions
  - **MINOR:** New principle/section added or materially expanded guidance
  - **PATCH:** Clarifications, wording, typo fixes, non-semantic refinements

---

## Governance

### Amendment Procedure

1. Proposed changes to this constitution MUST be documented with rationale
2. Significant changes require team discussion and consensus
3. After approval, increment version according to semantic versioning rules
4. Update `LAST_AMENDED_DATE` to current date
5. Propagate changes to dependent templates and documentation
6. Commit with message format: `docs: amend constitution to vX.Y.Z (summary of changes)`

### Versioning Policy

- Constitution version MUST be incremented with each amendment
- Version history tracked via git commits
- Major version changes indicate significant philosophical or architectural shifts

### Compliance & Reviews

- Architecture Decision Records (ADRs) MUST reference relevant constitutional principles
- Quarterly reviews to ensure codebase aligns with constitution
- Violations of core principles MUST be addressed or explicitly documented as technical debt
- New team members MUST read and acknowledge understanding of this constitution

---

## Conclusion

This constitution establishes the foundation for building a professional, maintainable, and scalable Gym Management System. All decisions—from code style to architecture to deployment strategy—should be evaluated against these principles.

When in doubt, prioritize:
1. Security and correctness
2. Long-term maintainability
3. Clarity and explicitness
4. User experience (for daily staff operations)
5. Performance and scalability

By adhering to these principles, we build a system that serves users well today and adapts to needs for years to come.

---

**End of Constitution v1.0.0**
