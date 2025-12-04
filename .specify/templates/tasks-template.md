# Task Breakdown: [FEATURE_NAME]

**Feature:** [Feature Name]  
**Plan Version:** [Version]  
**Generated:** [DATE]  
**Status:** Not Started | In Progress | Completed  

---

## Task Categories

Tasks are organized by category to align with constitutional principles and development workflow.

---

## 1. Planning & Specification

- [ ] **TASK-001:** Review and finalize feature specification
  - **Category:** Planning
  - **Priority:** High
  - **Estimated Effort:** [time]
  - **Assigned To:** [name]
  - **Dependencies:** None
  - **Description:** Ensure spec is complete, approved, and addresses all constitutional requirements

- [ ] **TASK-002:** Create detailed implementation plan
  - **Category:** Planning
  - **Priority:** High
  - **Estimated Effort:** [time]
  - **Assigned To:** [name]
  - **Dependencies:** TASK-001
  - **Description:** Break down implementation into phases and tasks

---

## 2. Domain Layer (Backend)

- [ ] **TASK-101:** Define domain entities and interfaces
  - **Category:** Domain
  - **Priority:** High
  - **Estimated Effort:** [time]
  - **Assigned To:** [name]
  - **Dependencies:** TASK-002
  - **Description:** Create TypeScript interfaces and types for core domain entities
  - **Files:** `src/domain/[entity].ts`

- [ ] **TASK-102:** Implement domain business rules
  - **Category:** Domain
  - **Priority:** High
  - **Estimated Effort:** [time]
  - **Assigned To:** [name]
  - **Dependencies:** TASK-101
  - **Description:** Implement business logic (e.g., subscription eligibility, check-in validation)
  - **Files:** `src/domain/[entity]/rules.ts`

- [ ] **TASK-103:** Write unit tests for domain logic
  - **Category:** Testing
  - **Priority:** High
  - **Estimated Effort:** [time]
  - **Assigned To:** [name]
  - **Dependencies:** TASK-102
  - **Description:** Test business rules without external dependencies
  - **Files:** `src/domain/[entity]/rules.spec.ts`

---

## 3. Database Layer (Prisma)

- [ ] **TASK-201:** Design and document database schema
  - **Category:** Database
  - **Priority:** High
  - **Estimated Effort:** [time]
  - **Assigned To:** [name]
  - **Dependencies:** TASK-101
  - **Description:** Plan tables, relationships, indexes, and constraints
  - **Files:** Design doc or schema comments

- [ ] **TASK-202:** Create Prisma schema updates
  - **Category:** Database
  - **Priority:** High
  - **Estimated Effort:** [time]
  - **Assigned To:** [name]
  - **Dependencies:** TASK-201
  - **Description:** Update `schema.prisma` with new models or fields
  - **Files:** `prisma/schema.prisma`

- [ ] **TASK-203:** Generate and review migration
  - **Category:** Database
  - **Priority:** High
  - **Estimated Effort:** [time]
  - **Assigned To:** [name]
  - **Dependencies:** TASK-202
  - **Description:** Run `prisma migrate dev`, review SQL, ensure backward compatibility
  - **Files:** `prisma/migrations/[timestamp]_[name]/migration.sql`

- [ ] **TASK-204:** Verify tenant isolation in schema
  - **Category:** Security
  - **Priority:** Critical
  - **Estimated Effort:** [time]
  - **Assigned To:** [name]
  - **Dependencies:** TASK-203
  - **Description:** Ensure all tenant-scoped entities have `tenantId`, proper indexes, and cascading rules
  - **Files:** `prisma/schema.prisma`

---

## 4. Application/Service Layer (Backend)

- [ ] **TASK-301:** Create NestJS module
  - **Category:** Application
  - **Priority:** High
  - **Estimated Effort:** [time]
  - **Assigned To:** [name]
  - **Dependencies:** TASK-203
  - **Description:** Set up feature module with DI configuration
  - **Files:** `src/[feature]/[feature].module.ts`

- [ ] **TASK-302:** Implement service layer use cases
  - **Category:** Application
  - **Priority:** High
  - **Estimated Effort:** [time]
  - **Assigned To:** [name]
  - **Dependencies:** TASK-301, TASK-102
  - **Description:** Orchestrate domain logic, handle transactions, call repository/Prisma
  - **Files:** `src/[feature]/[feature].service.ts`

- [ ] **TASK-303:** Create DTOs and validation
  - **Category:** Application
  - **Priority:** High
  - **Estimated Effort:** [time]
  - **Assigned To:** [name]
  - **Dependencies:** TASK-302
  - **Description:** Define request/response DTOs with class-validator decorators
  - **Files:** `src/[feature]/dto/[operation].dto.ts`

---

## 5. API/Controller Layer (Backend)

- [ ] **TASK-401:** Implement REST controllers
  - **Category:** API
  - **Priority:** High
  - **Estimated Effort:** [time]
  - **Assigned To:** [name]
  - **Dependencies:** TASK-302, TASK-303
  - **Description:** Create HTTP endpoints with proper decorators, guards, and error handling
  - **Files:** `src/[feature]/[feature].controller.ts`

- [ ] **TASK-402:** Add authorization guards
  - **Category:** Security
  - **Priority:** Critical
  - **Estimated Effort:** [time]
  - **Assigned To:** [name]
  - **Dependencies:** TASK-401
  - **Description:** Ensure tenant isolation and role checks (ADMIN for now)
  - **Files:** `src/[feature]/[feature].controller.ts`, `src/auth/guards/`

- [ ] **TASK-403:** Write integration tests for API endpoints
  - **Category:** Testing
  - **Priority:** High
  - **Estimated Effort:** [time]
  - **Assigned To:** [name]
  - **Dependencies:** TASK-402
  - **Description:** Test happy paths, error cases, validation, and tenant isolation
  - **Files:** `src/[feature]/[feature].controller.spec.ts`

---

## 6. Shared Contracts (TypeScript Types)

- [ ] **TASK-501:** Define shared API contracts
  - **Category:** Contracts
  - **Priority:** High
  - **Estimated Effort:** [time]
  - **Assigned To:** [name]
  - **Dependencies:** TASK-303
  - **Description:** Create TypeScript interfaces for API request/response used by frontend
  - **Files:** `packages/shared-types/[feature].types.ts` or similar

---

## 7. Frontend - Data Layer

- [ ] **TASK-601:** Create API client methods
  - **Category:** Frontend
  - **Priority:** High
  - **Estimated Effort:** [time]
  - **Assigned To:** [name]
  - **Dependencies:** TASK-501
  - **Description:** Implement fetch/axios calls using shared types
  - **Files:** `frontend/src/api/[feature].api.ts`

- [ ] **TASK-602:** Set up state management
  - **Category:** Frontend
  - **Priority:** Medium
  - **Estimated Effort:** [time]
  - **Assigned To:** [name]
  - **Dependencies:** TASK-601
  - **Description:** React Query, Zustand, or Context for managing feature state
  - **Files:** `frontend/src/state/[feature].state.ts`

---

## 8. Frontend - UI Components

- [ ] **TASK-701:** Design UI mockups/wireframes
  - **Category:** Design
  - **Priority:** High
  - **Estimated Effort:** [time]
  - **Assigned To:** [name]
  - **Dependencies:** TASK-002
  - **Description:** Create design for key screens and user flows

- [ ] **TASK-702:** Implement presentational components
  - **Category:** Frontend
  - **Priority:** High
  - **Estimated Effort:** [time]
  - **Assigned To:** [name]
  - **Dependencies:** TASK-701
  - **Description:** Build reusable components using shadcn/ui and Tailwind
  - **Files:** `frontend/src/components/[feature]/[Component].tsx`

- [ ] **TASK-703:** Implement page/view components
  - **Category:** Frontend
  - **Priority:** High
  - **Estimated Effort:** [time]
  - **Assigned To:** [name]
  - **Dependencies:** TASK-702, TASK-602
  - **Description:** Connect components to state and API, handle user interactions
  - **Files:** `frontend/src/pages/[Feature]Page.tsx`

- [ ] **TASK-704:** Add loading and error states
  - **Category:** Frontend
  - **Priority:** Medium
  - **Estimated Effort:** [time]
  - **Assigned To:** [name]
  - **Dependencies:** TASK-703
  - **Description:** Implement spinners, skeletons, error messages, and retry logic

- [ ] **TASK-705:** Ensure responsive design
  - **Category:** Frontend
  - **Priority:** Medium
  - **Estimated Effort:** [time]
  - **Assigned To:** [name]
  - **Dependencies:** TASK-703
  - **Description:** Test and adjust layouts for mobile, tablet, desktop

- [ ] **TASK-706:** Verify accessibility
  - **Category:** Frontend
  - **Priority:** Medium
  - **Estimated Effort:** [time]
  - **Assigned To:** [name]
  - **Dependencies:** TASK-703
  - **Description:** Check keyboard navigation, focus states, ARIA labels, semantic HTML

---

## 9. Documentation

- [ ] **TASK-801:** Write inline code comments
  - **Category:** Documentation
  - **Priority:** Medium
  - **Estimated Effort:** [time]
  - **Assigned To:** [name]
  - **Dependencies:** Implementation tasks
  - **Description:** Comment complex logic, domain rules, and non-obvious decisions

- [ ] **TASK-802:** Update API documentation
  - **Category:** Documentation
  - **Priority:** Medium
  - **Estimated Effort:** [time]
  - **Assigned To:** [name]
  - **Dependencies:** TASK-401
  - **Description:** Document new endpoints in OpenAPI/Swagger or similar

- [ ] **TASK-803:** Update README if needed
  - **Category:** Documentation
  - **Priority:** Low
  - **Estimated Effort:** [time]
  - **Assigned To:** [name]
  - **Dependencies:** All implementation tasks
  - **Description:** Add feature to README if user-facing or requires setup

---

## 10. Quality & Review

- [ ] **TASK-901:** Code review (backend)
  - **Category:** Review
  - **Priority:** High
  - **Estimated Effort:** [time]
  - **Assigned To:** [reviewer]
  - **Dependencies:** Backend tasks complete
  - **Description:** Review for correctness, security, maintainability, adherence to constitution

- [ ] **TASK-902:** Code review (frontend)
  - **Category:** Review
  - **Priority:** High
  - **Estimated Effort:** [time]
  - **Assigned To:** [reviewer]
  - **Dependencies:** Frontend tasks complete
  - **Description:** Review for UX, accessibility, state management, and consistency

- [ ] **TASK-903:** Security review
  - **Category:** Security
  - **Priority:** Critical
  - **Estimated Effort:** [time]
  - **Assigned To:** [security reviewer]
  - **Dependencies:** TASK-402, TASK-204
  - **Description:** Verify tenant isolation, authorization, input validation, and no PII logging

- [ ] **TASK-904:** Performance review
  - **Category:** Performance
  - **Priority:** Medium
  - **Estimated Effort:** [time]
  - **Assigned To:** [name]
  - **Dependencies:** All implementation tasks
  - **Description:** Check query performance, N+1 issues, index usage, frontend render performance

---

## 11. Deployment & Monitoring

- [ ] **TASK-1001:** Deploy to staging environment
  - **Category:** Deployment
  - **Priority:** High
  - **Estimated Effort:** [time]
  - **Assigned To:** [name]
  - **Dependencies:** All tasks complete, reviews passed
  - **Description:** Run migrations, deploy backend and frontend to staging

- [ ] **TASK-1002:** Manual testing in staging
  - **Category:** Testing
  - **Priority:** High
  - **Estimated Effort:** [time]
  - **Assigned To:** [QA or team]
  - **Dependencies:** TASK-1001
  - **Description:** Execute manual test checklist, verify user flows

- [ ] **TASK-1003:** Deploy to production
  - **Category:** Deployment
  - **Priority:** High
  - **Estimated Effort:** [time]
  - **Assigned To:** [name]
  - **Dependencies:** TASK-1002
  - **Description:** Deploy to production, monitor for issues

- [ ] **TASK-1004:** Post-deployment monitoring
  - **Category:** Monitoring
  - **Priority:** High
  - **Estimated Effort:** [time]
  - **Assigned To:** [name]
  - **Dependencies:** TASK-1003
  - **Description:** Monitor logs, errors, performance metrics for 24-48 hours

---

## Task Summary

**Total Tasks:** [count]  
**Estimated Total Effort:** [sum of efforts]  
**Critical Path:** [identify bottleneck tasks]  
**Parallel Work Opportunities:** [tasks that can be done simultaneously]

---

## Notes

- Task IDs are sequential within categories for easy reference
- Adjust priorities and assignments as team capacity changes
- Mark tasks complete as they are finished and reviewed
- Add new tasks if scope expands (update plan document accordingly)

---

**End of Task Breakdown**
