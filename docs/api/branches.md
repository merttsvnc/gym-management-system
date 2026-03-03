# Branches API

## Scope

- Branch CRUD and lifecycle
- Default branch behavior
- Branch-level access boundaries

## Endpoints

- `GET /branches`
- `GET /branches/:id`
- `POST /branches`
- `PATCH /branches/:id`
- `POST /branches/:id/archive`
- `POST /branches/:id/restore`
- `POST /branches/:id/set-default`

## Rules

- Branch data is tenant-isolated.
- Default branch invariants must be preserved.
- Billing and plan limits can restrict branch creation.
