# Members API

## Scope

- Member CRUD
- Search and filtering
- Status transitions and archive
- Membership state derivation and expiring logic

## Endpoints

- `POST /members`
- `GET /members`
- `GET /members/:id`
- `PATCH /members/:id`
- `POST /members/:id/status`
- `POST /members/:id/archive`
- Scheduled membership plan change endpoints where implemented

## Query and Filtering

Supported filters include `status`, `search`, `branchId`, and expiring window parameters where available.

Business semantics must remain consistent between member list and dashboard/report counters.

## Field and Validation Policy

- Required create fields are domain-defined and validated at DTO level.
- Optional profile fields are accepted but tenant-safe.
- Phone uniqueness is enforced with tenant-aware constraints.
- Server-managed/computed fields must not be client-authored.

## Status and Derived State

Persisted member workflow status and derived membership state are separate concepts.
Documented responses should expose both only when needed and with clear naming.
