# Implementation Plan: [FEATURE_NAME]

**Version:** 1.0.0  
**Created:** [DATE]  
**Updated:** [DATE]  
**Status:** Planning | In Progress | Completed  

---

## Overview

### Feature Summary
Brief description of the feature being implemented.

### Related Specification
Link or reference to the detailed specification document.

### Estimated Effort
Rough time estimate (person-days or story points).

---

## Constitution Compliance Check

Before proceeding, verify alignment with core constitutional principles:

- [ ] **Long-Term Maintainability:** Is this approach maintainable by future developers?
- [ ] **Security & Correctness:** Are security and correctness prioritized over simplicity?
- [ ] **Explicit Domain Rules:** Are business rules explicit, testable, and documented?
- [ ] **Layered Architecture:** Is business logic separated from infrastructure and presentation?
- [ ] **Multi-Tenant Isolation:** Is tenant isolation enforced at all layers?
- [ ] **Data Integrity:** Are migrations backward compatible and reviewed?
- [ ] **Professional UI/UX:** Does the UI support fast, daily workflows with clear status indicators?
- [ ] **Performance & Scalability:** Are indexes, pagination, and efficient queries planned?
- [ ] **Testing Coverage:** Are critical paths covered by unit and integration tests?

If any items are not checked, document the reason and mitigation strategy.

---

## Implementation Phases

Break down the work into logical phases that can be completed and tested incrementally.

### Phase 1: [Phase Name]

**Goal:** Clear objective for this phase

**Tasks:**
1. [ ] Task 1: Description
   - Estimated effort: [time]
   - Dependencies: None | Task X
   - Files affected: [list]

2. [ ] Task 2: Description
   - Estimated effort: [time]
   - Dependencies: Task 1
   - Files affected: [list]

**Deliverables:**
- Deliverable 1
- Deliverable 2

**Testing:**
- Tests to be written/updated during this phase

**Review Points:**
- What should be reviewed before moving to next phase?

---

### Phase 2: [Phase Name]

**Goal:** Clear objective for this phase

**Tasks:**
1. [ ] Task 1: Description
2. [ ] Task 2: Description

**Deliverables:**

**Testing:**

**Review Points:**

---

### Phase 3: [Phase Name]

(Repeat structure as needed)

---

## Dependencies

### External Dependencies
- Third-party libraries or services required
- Configuration or environment setup needed

### Internal Dependencies
- Other features or modules that must be completed first
- Team members who need to provide input or review

### Blocking Issues
Any known blockers that must be resolved before starting?

---

## Database Changes

### New Tables/Models
List new Prisma models to be created

### Schema Modifications
Changes to existing models

### Migrations
- Migration 1: Description
  - Backward compatible: Yes/No
  - Data migration required: Yes/No
  - Risks: [any risks]

### Index Strategy
Required indexes and rationale:
- Table: Column(s) - Reason

---

## API Changes

### New Endpoints
List new API endpoints to be created

### Modified Endpoints
Changes to existing endpoints (breaking or non-breaking)

### Contract Updates
Changes to shared TypeScript types/interfaces

---

## Frontend Changes

### New Components
List new UI components to be built

### Modified Components
Changes to existing components

### New Routes
New pages or routes to be added

### State Management
New state or changes to existing state management

---

## Testing Strategy

### Unit Tests
Which domain logic requires unit tests?
- Module/Function: Test cases

### Integration Tests
Which API endpoints require integration tests?
- Endpoint: Test scenarios (happy path, errors, edge cases)

### Manual Testing Checklist
User flows to manually verify:
- [ ] Flow 1: Steps to test
- [ ] Flow 2: Steps to test

---

## Rollout Strategy

### Feature Flags
Should this be behind a feature flag? Why or why not?

### Deployment Plan
- Deploy backend first, then frontend? Or together?
- Any data migration scripts to run?
- Rollback plan if issues occur?

### Monitoring
What should be monitored after deployment?
- Key metrics
- Error rates
- Performance indicators

---

## Documentation Updates

### Code Documentation
- [ ] Inline comments for complex logic
- [ ] JSDoc/TSDoc for public APIs

### External Documentation
- [ ] README updates
- [ ] API documentation
- [ ] User guide (if applicable)

### Specification Updates
- [ ] Update spec if implementation deviates from original design
- [ ] Document any deferred enhancements

---

## Risk Assessment

### Technical Risks
- Risk 1: Description
  - Likelihood: Low | Medium | High
  - Impact: Low | Medium | High
  - Mitigation: Strategy

### Security Risks
- Risk 1: Description
  - Mitigation: Strategy

### Performance Risks
- Risk 1: Description
  - Mitigation: Strategy

---

## Success Criteria

How will we know this feature is successfully implemented?

- [ ] All acceptance criteria from spec met
- [ ] All tests passing
- [ ] No critical security issues
- [ ] Performance requirements met
- [ ] Code review approved
- [ ] Documentation complete

---

## Post-Implementation Review

After completion, reflect on:

### What Went Well
- 

### What Could Be Improved
- 

### Lessons Learned
- 

### Follow-Up Items
- [ ] Item 1
- [ ] Item 2

---

**End of Plan**
