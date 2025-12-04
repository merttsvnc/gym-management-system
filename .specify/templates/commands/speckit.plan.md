---
description: Create an implementation plan from a feature specification, breaking work into phases with clear dependencies and review points.
handoffs: 
  - label: Generate Task Breakdown
    agent: speckit.tasks
    prompt: Create a detailed task breakdown from this implementation plan. The plan is...
---

## User Input

```text
$ARGUMENTS
```

You **MUST** consider the user input before proceeding (if not empty).

## Outline

You are creating an implementation plan at `.specify/plans/[feature-name]-plan.md`. This plan translates the feature specification into actionable phases and tasks.

Follow this execution flow:

1. **Load Context**
   - Read `.specify/memory/constitution.md` for project principles
   - Read `.specify/templates/plan-template.md` for plan structure
   - Read the feature specification from `.specify/specs/[feature-name].md`
   - Review existing codebase structure to understand where code will live

2. **Constitution Compliance Check**
   Before planning implementation, verify:
   - [ ] Long-term maintainability approach defined
   - [ ] Security and correctness prioritized
   - [ ] Domain rules will be explicit and testable
   - [ ] Layered architecture will be followed (domain, application, infrastructure)
   - [ ] Multi-tenant isolation enforced at all layers
   - [ ] Migration strategy is backward compatible
   - [ ] UI supports fast daily workflows
   - [ ] Performance: indexes and pagination planned
   - [ ] Testing coverage for critical paths
   
   If any are unchecked, adjust the plan to address gaps.

3. **Identify Implementation Phases**
   Break work into logical phases that can be:
   - Completed incrementally
   - Tested independently
   - Reviewed before moving forward
   
   Typical phase structure:
   - **Phase 1:** Domain model and business rules (backend)
   - **Phase 2:** Database schema and migrations
   - **Phase 3:** Service layer and API endpoints
   - **Phase 4:** Shared contracts and frontend data layer
   - **Phase 5:** UI components and user flows
   - **Phase 6:** Integration testing and polish
   
   Adjust based on feature complexity and dependencies.

4. **Define Tasks for Each Phase**
   For each phase, list concrete tasks with:
   - Clear description
   - Estimated effort (hours, days, or story points)
   - Dependencies (which tasks must complete first)
   - Files/modules affected
   - Deliverables
   - Testing requirements
   - Review points
   
   Use the constitutional principles to ensure tasks include:
   - Unit tests for domain logic
   - Integration tests for API endpoints
   - Tenant isolation verification
   - Migration review
   - Security review for auth/authorization code

5. **Document Dependencies**
   Identify:
   - External dependencies (libraries, services, configs)
   - Internal dependencies (other features, modules, team members)
   - Blocking issues that must be resolved
   
   This helps avoid surprises during implementation.

6. **Plan Database Changes**
   Based on the spec's data model section:
   - List new tables/models
   - List schema modifications to existing models
   - For each migration:
     - Is it backward compatible?
     - Does it require data migration?
     - What are the risks?
   - Document index strategy and rationale

7. **Plan API Changes**
   Based on the spec's API section:
   - List new endpoints to create
   - List modifications to existing endpoints (breaking or not)
   - Identify shared TypeScript contract updates needed

8. **Plan Frontend Changes**
   Based on the spec's frontend section:
   - List new components to build
   - List modifications to existing components
   - Identify new routes/pages
   - Document state management approach

9. **Define Testing Strategy**
   - Which domain logic requires unit tests? (list specific functions/rules)
   - Which API endpoints require integration tests? (list scenarios)
   - Manual testing checklist for user flows
   - Performance testing if applicable

10. **Plan Rollout Strategy**
    - Should this be behind a feature flag?
    - Deployment order (backend first, then frontend? or together?)
    - Data migration scripts needed?
    - Rollback plan if issues occur?
    - What metrics/logs to monitor after deployment?

11. **Assess Risks**
    Identify and document:
    - **Technical risks:** Performance concerns, integration challenges, complexity
    - **Security risks:** Tenant isolation edge cases, authorization gaps, PII handling
    - **Performance risks:** Query performance, N+1 issues, large data volumes
    
    For each risk, provide mitigation strategy.

12. **Define Success Criteria**
    How will the team know the feature is done and done well?
    - All acceptance criteria from spec met
    - All tests passing (unit, integration, manual)
    - No critical security issues
    - Performance requirements met
    - Code reviewed and approved
    - Documentation complete

13. **Write the Plan**
    - Use plan template structure
    - Fill in all sections with concrete details
    - Estimate total effort (sum of task estimates)
    - Identify critical path (longest chain of dependent tasks)
    - Note opportunities for parallel work
    - Write to `.specify/plans/[feature-name]-plan.md`

14. **Output Summary**
    Provide the user with:
    - Plan file path
    - Total estimated effort
    - Number of phases and tasks
    - Critical path and estimated timeline
    - Key risks and mitigations
    - Suggested next step: "Ready for detailed task breakdown? Use /speckit.tasks"

## Validation Rules

- Each task must have clear deliverables
- Dependencies must be explicit (no circular dependencies)
- Testing is included in every phase, not deferred to the end
- Constitution compliance checks must be completed before implementation starts
- Risks must have mitigation strategies, not just listed

## Quality Standards

- Be realistic with effort estimates (include time for testing, review, documentation)
- Prefer smaller, focused phases over large, monolithic ones
- Include review points between phases to catch issues early
- Make the plan readable by both technical and non-technical stakeholders
- Use clear, action-oriented language

## Notes

- The plan is a living document; update it as work progresses
- If implementation reveals better approaches, update the plan
- Significant deviations from the plan should be discussed with the team
- Track actual vs. estimated effort to improve future estimates

--- End Command ---

