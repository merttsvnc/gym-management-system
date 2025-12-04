# Gym Management System

A professional-grade, multi-tenant SaaS platform for gym management, built with modern technologies and designed for long-term growth.

## Overview

This system provides comprehensive gym management capabilities including:
- Member registration and management
- Subscription and membership plans
- Check-in tracking
- Payment processing
- Multi-branch support
- Staff and admin management

**Status:** In Development

## Architecture

### Technology Stack

**Backend:**
- **Framework:** NestJS (TypeScript)
- **Database:** PostgreSQL
- **ORM:** Prisma
- **Authentication:** JWT
- **API:** RESTful, versioned (v1)

**Frontend:**
- **Framework:** React 18+ with TypeScript
- **Build Tool:** Vite
- **UI Library:** shadcn/ui + Tailwind CSS
- **State Management:** React Query (TBD)

### Architectural Principles

The system follows a **layered, modular architecture**:

**Backend Layers:**
1. **Domain Layer:** Core business entities, rules, and interfaces
2. **Application/Service Layer:** Use cases, orchestration, transaction boundaries
3. **Infrastructure Layer:** Database access (Prisma), HTTP controllers, external services

**Frontend Layers:**
1. **UI Components:** Presentational components (shadcn/ui + Tailwind)
2. **Application Logic:** State management, API client, routing
3. **Shared Contracts:** TypeScript types/interfaces shared with backend

### Multi-Tenancy

This is a **multi-tenant SaaS** where:
- Each gym account is a **Tenant**
- All gym-specific data is scoped by `tenantId`
- Tenant isolation is enforced at both database and application levels
- Users can only access data from their own tenant

## Getting Started

### Prerequisites

- Node.js 18+ and npm/yarn
- PostgreSQL 14+
- Git

### Setup

```bash
# Clone the repository
git clone <repository-url>
cd gym-management-system

# Install backend dependencies
cd backend
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your database credentials and secrets

# Run database migrations
npx prisma migrate dev

# Start backend development server
npm run start:dev

# In a new terminal, install frontend dependencies
cd ../frontend
npm install

# Start frontend development server
npm run dev
```

### Environment Variables

**Backend (.env):**
```env
DATABASE_URL="postgresql://user:password@localhost:5432/gym_management"
JWT_SECRET="your-secret-key"
JWT_EXPIRY="1h"
PORT=3000
NODE_ENV="development"
```

**Frontend (.env):**
```env
VITE_API_URL="http://localhost:3000/api/v1"
```

## Project Constitution

This project follows a comprehensive [**constitution**](.specify/memory/constitution.md) that establishes:

- **Core Principles:** Long-term maintainability, security, explicit domain rules
- **Architecture Standards:** Layered architecture, TypeScript end-to-end, modular design
- **Security Requirements:** Multi-tenant isolation, authentication, authorization
- **Quality Standards:** Testing requirements, linting, formatting, CI/CD
- **Collaboration Guidelines:** Git workflow, PR process, code review standards

**All contributors must read and adhere to the constitution.**

## Specification System

This project uses a structured specification workflow:

### 1. Constitution (`/speckit.constitution`)
Defines foundational principles and standards. Start here for project-wide decisions.

### 2. Feature Specification (`/speckit.specify`)
Create detailed feature specs covering:
- Domain model and business rules
- API endpoints and contracts
- Data model (Prisma schema)
- Frontend UI/UX requirements
- Security and testing requirements

Specifications live in `.specify/specs/`

### 3. Implementation Plan (`/speckit.plan`)
Break down specs into phases with:
- Task lists and dependencies
- Database migration strategy
- Testing strategy
- Rollout plan and risk assessment

Plans live in `.specify/plans/`

### 4. Task Breakdown (`/speckit.tasks`)
Generate detailed, assignable tasks organized by category:
- Domain layer, database, API, frontend, testing, deployment
- Clear priorities, estimates, and dependencies

Task lists live in `.specify/tasks/`

### Workflow Example

```bash
# 1. Define a new feature
/speckit.specify member-registration

# 2. Create implementation plan
/speckit.plan member-registration

# 3. Generate task breakdown
/speckit.tasks member-registration

# 4. Assign tasks and start implementation
# 5. Review and deploy
```

## Development Workflow

### Branching Strategy

- **`main`**: Production-ready code, always deployable
- **Feature branches**: `feature/[feature-name]` for new work
- **Fix branches**: `fix/[bug-description]` for bug fixes

### Commit Messages

Use clear, imperative-style messages:
```
Add member registration endpoint
Fix subscription renewal date calculation
Update Prisma schema with check-in model
```

### Pull Requests

- Keep PRs small and focused (< 400 lines when possible)
- Provide clear description and link to spec/issue
- Self-review before requesting team review
- Ensure all tests pass and linting is clean

### Code Quality

**Linting & Formatting:**
```bash
# Backend
npm run lint
npm run format

# Frontend
npm run lint
npm run format
```

**Testing:**
```bash
# Backend unit tests
npm run test

# Backend integration tests
npm run test:e2e

# Frontend tests
npm run test
```

**Type Checking:**
```bash
# Backend
npm run type-check

# Frontend
npm run type-check
```

### CI/CD

Automated checks on every PR:
- Linting and formatting
- Type checking
- Unit and integration tests
- Build verification

## Project Structure

```
gym-management-system/
├── backend/                 # NestJS backend
│   ├── src/
│   │   ├── domain/         # Domain entities and business rules
│   │   ├── modules/        # Feature modules (members, subscriptions, etc.)
│   │   ├── auth/           # Authentication and authorization
│   │   ├── common/         # Shared utilities and middleware
│   │   └── main.ts
│   ├── prisma/
│   │   ├── schema.prisma   # Database schema
│   │   └── migrations/     # Version-controlled migrations
│   └── test/               # Integration tests
├── frontend/               # React frontend
│   ├── src/
│   │   ├── components/     # UI components
│   │   ├── pages/          # Page components
│   │   ├── api/            # API client
│   │   ├── state/          # State management
│   │   └── main.tsx
│   └── public/
├── shared-types/           # Shared TypeScript contracts (planned)
└── .specify/               # Specification system
    ├── memory/
    │   └── constitution.md # Project constitution
    ├── specs/              # Feature specifications
    ├── plans/              # Implementation plans
    ├── tasks/              # Task breakdowns
    └── templates/          # Templates for specs, plans, tasks
```

## Testing Strategy

### Backend Testing

**Unit Tests:**
- Domain logic and business rules
- Pure functions and utilities
- Testable without database or HTTP

**Integration Tests:**
- API endpoints (request/response)
- Database operations
- Authentication and authorization
- Tenant isolation

### Frontend Testing

**Component Tests:**
- UI component rendering
- User interactions
- State management

**Integration Tests:**
- User flows
- API integration

## Security

### Key Security Measures

- **Password Hashing:** bcrypt or Argon2
- **Authentication:** JWT with proper expiry and refresh tokens
- **Authorization:** Role-based (ADMIN for now, more roles planned)
- **Tenant Isolation:** Enforced at database and application layers
- **Input Validation:** DTOs with class-validator
- **SQL Injection Prevention:** Prisma parameterized queries
- **Secrets Management:** Environment variables, never committed

### Reporting Security Issues

Please report security vulnerabilities to [security contact email].

## Performance Considerations

- **Database Indexing:** All frequently queried columns indexed
- **Pagination:** All list endpoints paginated by default
- **N+1 Prevention:** Proper Prisma relation loading
- **Caching:** Strategic caching for read-heavy data
- **Code Splitting:** Frontend lazy loading

## Contributing

1. Read the [constitution](.specify/memory/constitution.md)
2. Check existing specifications in `.specify/specs/`
3. Create a feature branch
4. Write tests for your changes
5. Ensure all quality checks pass
6. Submit a pull request

## License

[License Type] - See LICENSE file for details

## Contact

- **Project Maintainer:** [Name]
- **Email:** [Email]
- **Repository:** [GitHub URL]

---

**Built with ❤️ for modern gym management**
