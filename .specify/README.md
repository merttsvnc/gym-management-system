# Specification System (Speckit)

This directory contains the specification system for the Gym Management System. It provides a structured workflow for defining, planning, and implementing features while maintaining constitutional compliance.

## Directory Structure

```
.specify/
├── memory/
│   └── constitution.md          # Project constitution (foundational principles)
├── specs/                       # Feature specifications
├── plans/                       # Implementation plans
├── tasks/                       # Task breakdowns
└── templates/                   # Templates for specs, plans, tasks
    ├── spec-template.md
    ├── plan-template.md
    ├── tasks-template.md
    └── commands/                # Cursor command definitions
        ├── speckit.constitution.md
        ├── speckit.specify.md
        ├── speckit.plan.md
        └── speckit.tasks.md
```

## Workflow

### 1. Start with the Constitution

The [constitution](memory/constitution.md) is the source of truth for all project decisions.

**Key Principles:**
- Long-term maintainability over quick hacks
- Security and correctness are non-negotiable
- Explicit, testable domain rules
- Multi-tenant isolation at all layers
- Professional UI optimized for daily use

Before starting any new work, ensure it aligns with constitutional principles.

### 2. Create a Feature Specification

Use: `/speckit.specify [feature-name]`

A specification documents:
- **Purpose and scope** of the feature
- **Domain model** (entities, relationships, business rules)
- **API endpoints** (request/response contracts)
- **Data model** (Prisma schema changes)
- **Frontend requirements** (UI/UX, components, flows)
- **Security considerations** (tenant isolation, authorization)
- **Testing requirements** (unit tests, integration tests)
- **Performance considerations** (indexes, queries, scalability)

**Output:** `.specify/specs/[feature-name].md`

**Example:**
```bash
/speckit.specify member-registration
```

### 3. Create an Implementation Plan

Use: `/speckit.plan [feature-name]`

An implementation plan breaks the spec into:
- **Phases** (logical groupings of work)
- **Tasks** (concrete actions with dependencies)
- **Database changes** (migrations, indexes)
- **API changes** (new or modified endpoints)
- **Frontend changes** (components, routes, state)
- **Testing strategy** (unit, integration, manual)
- **Rollout strategy** (deployment, monitoring)
- **Risk assessment** (technical, security, performance)

**Output:** `.specify/plans/[feature-name]-plan.md`

**Example:**
```bash
/speckit.plan member-registration
```

### 4. Generate Task Breakdown

Use: `/speckit.tasks [feature-name]`

A task breakdown provides:
- **Categorized tasks** (domain, database, API, frontend, testing, deployment)
- **Clear priorities** (Critical, High, Medium, Low)
- **Effort estimates** (hours or story points)
- **Dependencies** (which tasks must complete first)
- **Assignees** (who will do the work)

**Output:** `.specify/tasks/[feature-name]-tasks.md`

**Example:**
```bash
/speckit.tasks member-registration
```

### 5. Implement and Review

- Assign tasks to team members
- Implement according to spec and plan
- Write tests as you go (not at the end)
- Review code for constitutional compliance
- Deploy to staging, test, then production

## Templates

### Spec Template

[spec-template.md](templates/spec-template.md) provides the structure for feature specifications.

**Key Sections:**
- Overview (purpose, scope, constitutional alignment)
- Domain Model (entities, relationships, business rules)
- API Specification (endpoints, contracts, validation)
- Data Model (Prisma schema, migrations)
- Frontend Specification (UI, flows, components)
- Security & Tenant Isolation
- Testing Requirements
- Performance & Scalability

### Plan Template

[plan-template.md](templates/plan-template.md) provides the structure for implementation plans.

**Key Sections:**
- Constitution Compliance Check
- Implementation Phases (with tasks, deliverables, testing)
- Dependencies (external, internal, blocking)
- Database Changes (migrations, indexes)
- API Changes (endpoints, contracts)
- Frontend Changes (components, routes, state)
- Testing Strategy (unit, integration, manual)
- Rollout Strategy (deployment, monitoring)
- Risk Assessment (technical, security, performance)

### Tasks Template

[tasks-template.md](templates/tasks-template.md) provides the structure for task breakdowns.

**Task Categories:**
1. Planning & Specification
2. Domain Layer (Backend)
3. Database Layer (Prisma)
4. Application/Service Layer (Backend)
5. API/Controller Layer (Backend)
6. Shared Contracts (TypeScript Types)
7. Frontend - Data Layer
8. Frontend - UI Components
9. Documentation
10. Quality & Review
11. Deployment & Monitoring

## Commands

### `/speckit.constitution`

Create or update the project constitution.

**When to use:**
- Initial project setup
- Adding or modifying core principles
- Changing governance rules
- Major architectural decisions

**Output:** Updates `memory/constitution.md`

### `/speckit.specify [feature-name]`

Create a detailed feature specification.

**When to use:**
- Starting a new feature
- Documenting existing features
- Clarifying requirements before implementation

**Output:** `specs/[feature-name].md`

### `/speckit.plan [feature-name]`

Create an implementation plan from a specification.

**When to use:**
- After spec is approved
- Before starting implementation
- To estimate effort and timeline

**Output:** `plans/[feature-name]-plan.md`

### `/speckit.tasks [feature-name]`

Generate a detailed task breakdown from a plan.

**When to use:**
- After plan is reviewed
- To assign work to team members
- To track progress in project management tools

**Output:** `tasks/[feature-name]-tasks.md`

## Best Practices

### 1. Spec First, Then Implement

Don't start coding without a spec. The spec is your design document and communication tool.

### 2. Keep Specs and Reality in Sync

If implementation deviates from the spec (for good reasons), update the spec to reflect reality.

### 3. Review Specs, Not Just Code

Catch issues early by reviewing specs before implementation starts.

### 4. Use Specs as Onboarding Material

New developers can read specs to understand features without diving into code.

### 5. Reference Constitutional Principles

When making decisions, explicitly reference which constitutional principles guide the choice.

### 6. Iterate on Plans

Plans can evolve as work progresses. Update them to reflect new learnings.

### 7. Track Task Progress

Mark tasks complete as they finish. This helps the team see progress and identify blockers.

### 8. Test Against Specs

Use specs as the source of truth for acceptance criteria in testing.

## Tips

- **Start small:** Begin with a simple feature to get comfortable with the workflow
- **Be explicit:** Vague specs lead to unclear implementations
- **Include examples:** Concrete examples clarify abstract rules
- **Think long-term:** Every decision should consider future maintainability
- **Prioritize security:** Tenant isolation and authorization are critical in a multi-tenant SaaS
- **Document trade-offs:** When you make a compromise, explain why

## Examples

### Example: Member Registration Feature

1. **Spec:** `specs/member-registration.md`
   - Domain model: Member entity with required fields
   - API: POST /api/v1/members with validation
   - Database: members table with tenantId and indexes
   - Frontend: Registration form with validation and error handling

2. **Plan:** `plans/member-registration-plan.md`
   - Phase 1: Domain model and database
   - Phase 2: API endpoints and tests
   - Phase 3: Frontend components
   - Phase 4: Integration and deployment

3. **Tasks:** `tasks/member-registration-tasks.md`
   - 25 tasks across 11 categories
   - Critical path: 12 tasks (2-3 days)
   - Parallel work: Frontend can start after API contracts defined

## Need Help?

- Read the [constitution](memory/constitution.md) for project principles
- Check existing specs in `specs/` for examples
- Review templates in `templates/` for structure
- Ask the team for clarification before making assumptions

---

**Remember:** The specification system exists to help us build better software. Use it as a tool, not a burden.

