# Membership Plans API

## Scope

- Plan CRUD
- Plan lifecycle (active/archive/restore/delete)
- Plan assignment impact on members
- Scheduled plan change behavior

## Endpoints

- `GET /membership-plans`
- `GET /membership-plans/active`
- `GET /membership-plans/:id`
- `POST /membership-plans`
- `PATCH /membership-plans/:id`
- `POST /membership-plans/:id/archive`
- `POST /membership-plans/:id/restore`
- `DELETE /membership-plans/:id`

## Rules

- All operations are tenant-scoped.
- Duration and currency fields must pass strict validation.
- Deletion/archival constraints apply when plans are referenced by active members.
