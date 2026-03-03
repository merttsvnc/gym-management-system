# Architecture Overview

## System Overview

Backend is a modular NestJS service with PostgreSQL/Prisma and tenant-scoped domain boundaries.

## Key Modules

- Auth and access control
- Members and membership plans
- Branch management
- Payments, product sales, and reports

## Important Constraints

- Strict multi-tenant isolation at query and service layers.
- Branch-aware operations require consistent scoping rules.
- Reporting logic is timezone-aware and must keep metric definitions stable.
- Scheduler jobs must be safe under multi-instance deployment.

## Integration Boundaries

- API served under `/api/v1`.
- Frontend/mobile clients consume versioned REST contracts.
- External integrations (email/storage) are configuration-driven.
