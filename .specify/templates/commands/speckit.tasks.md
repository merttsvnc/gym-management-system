---
description: Generate a detailed task breakdown from an implementation plan, organized by category and ready for assignment and tracking.
handoffs: []
---

## User Input

```text
$ARGUMENTS
```

You **MUST** consider the user input before proceeding (if not empty).

## Outline

You are creating a detailed task breakdown at `.specify/tasks/[feature-name]-tasks.md`. This breakdown translates the implementation plan into specific, trackable, assignable tasks.

Follow this execution flow:

1. **Load Context**
   - Read `.specify/memory/constitution.md` for project principles
   - Read `.specify/templates/tasks-template.md` for task structure
   - Read the implementation plan from `.specify/plans/[feature-name]-plan.md`
   - Read the feature spec from `.specify/specs/[feature-name].md`

2. **Task Organization Principles**
   Organize tasks by category to align with constitutional principles:
   - **Planning & Specification:** Finalize specs, plans, architecture decisions
   - **Domain Layer:** Business logic, domain entities, rules (backend)
   - **Database Layer:** Prisma schema, migrations, indexes
   - **Application/Service Layer:** NestJS services, use case orchestration
   - **API/Controller Layer:** HTTP endpoints, DTOs, validation
   - **Shared Contracts:** TypeScript types shared between backend and frontend
   - **Frontend - Data Layer:** API clients, state management
   - **Frontend - UI Components:** React components, pages, user flows
   - **Documentation:** Inline comments, API docs, README updates
   - **Quality & Review:** Code reviews, security reviews, performance checks
   - **Deployment & Monitoring:** Staging, production, post-deployment monitoring

3. **Generate Tasks from Plan Phases**
   For each phase in the plan:
   - Break down into atomic tasks (1-4 hours of work each)
   - Assign to appropriate category
   - Set priority (Critical, High, Medium, Low)
   - Estimate effort (hours or story points)
   - Document dependencies (task IDs or "None")
   - List files/modules affected
   - Include clear description and acceptance criteria

4. **Ensure Constitutional Alignment**
   Make sure tasks include:
   - **Tenant Isolation:** Verify `tenantId` in all tenant-scoped entities and queries
   - **Domain Testing:** Unit tests for business rules (not integration tests)
   - **API Testing:** Integration tests for endpoints (happy path, errors, edge cases)
   - **Security:** Authorization guards, input validation, no sensitive data logging
   - **Migration Review:** Backward compatibility check, SQL review before merge
   - **UI/UX:** Loading states, error handling, accessibility checks
   - **Performance:** Index verification, query optimization, N+1 prevention
   - **Documentation:** Inline comments for complex logic, API documentation

5. **Task Naming Convention**
   Use clear, unique task IDs:
   - Format: `TASK-[category_number][sequential_number]`
   - Examples:
     - `TASK-001`: Planning tasks
     - `TASK-101`: Domain layer tasks
     - `TASK-201`: Database layer tasks
     - `TASK-301`: Application/service layer tasks
     - `TASK-401`: API/controller layer tasks
     - `TASK-501`: Shared contracts tasks
     - `TASK-601`: Frontend data layer tasks
     - `TASK-701`: Frontend UI tasks
     - `TASK-801`: Documentation tasks
     - `TASK-901`: Quality & review tasks
     - `TASK-1001`: Deployment & monitoring tasks

6. **Define Task Dependencies**
   Map dependencies between tasks:
   - Use task IDs to reference dependencies
   - Identify tasks that can run in parallel
   - Highlight critical path (longest chain of dependencies)
   - Note bottleneck tasks that block many others

7. **Set Priorities**
   - **Critical:** Security, tenant isolation, data integrity, blocking issues
   - **High:** Core functionality, critical user flows, foundational tasks
   - **Medium:** Enhancements, non-blocking features, polish
   - **Low:** Nice-to-haves, deferred improvements, documentation extras

8. **Estimate Effort**
   - Be realistic (include coding, testing, review, documentation)
   - Use consistent units (hours, days, or story points)
   - Account for complexity and uncertainty
   - Reference historical data if available

9. **Include Review Tasks**
   Explicitly add tasks for:
   - Code review (backend and frontend separately)
   - Security review (auth, authorization, tenant isolation)
   - Performance review (queries, indexes, N+1 issues)
   - Accessibility review (keyboard nav, labels, semantic HTML)

10. **Include Testing Tasks**
    Testing is not optional. Add tasks for:
    - Unit tests for domain logic (testable without DB/HTTP)
    - Integration tests for API endpoints (test with real DB or test DB)
    - Manual testing checklist (user flows in staging)

11. **Include Deployment Tasks**
    - Deploy to staging
    - Manual testing in staging
    - Deploy to production
    - Post-deployment monitoring (24-48 hours)

12. **Write the Task Breakdown**
    - Use tasks template structure
    - Fill in all sections with concrete tasks
    - Provide task summary (total count, estimated effort, critical path)
    - Note parallel work opportunities
    - Write to `.specify/tasks/[feature-name]-tasks.md`

13. **Output Summary**
    Provide the user with:
    - Task file path
    - Total number of tasks
    - Estimated total effort
    - Critical path length
    - Number of tasks that can run in parallel
    - Suggested next step: "Tasks are ready for assignment and tracking. Begin implementation or import into your project management tool."

## Task Checklist Template

Each task should follow this structure:

```markdown
- [ ] **TASK-XXX:** [Clear task name]
  - **Category:** [Category name]
  - **Priority:** Critical | High | Medium | Low
  - **Estimated Effort:** [time estimate]
  - **Assigned To:** [name or TBD]
  - **Dependencies:** [task IDs or "None"]
  - **Description:** [What needs to be done and why]
  - **Files:** [Files or modules affected]
  - **Acceptance Criteria:** [How to know it's done]
```

## Validation Rules

- Every task must have a unique ID
- Dependencies must reference existing task IDs
- No circular dependencies
- Critical path tasks must be prioritized
- Tasks requiring security review must be flagged as Critical or High
- All tenant-scoped entities must have a task to verify tenant isolation
- All API endpoints must have integration test tasks
- All domain logic must have unit test tasks

## Quality Standards

- Tasks are atomic (completable in 1-4 hours)
- Descriptions are clear and actionable
- Dependencies are explicit
- Priorities align with constitutional principles
- Testing and review are not deferred to the end
- Tasks are organized logically by category

## Notes

- Task breakdown can be imported into project management tools (Jira, Linear, etc.)
- Mark tasks complete as they finish and pass review
- Add new tasks if scope expands (update plan accordingly)
- Track actual vs. estimated effort to improve future estimates

--- End Command ---

