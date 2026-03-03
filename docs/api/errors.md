# Error Contract

## Standard Envelope

All API errors should follow one stable JSON shape:

- `statusCode`
- `message`
- `error`
- `timestamp`
- `path`
- `requestId` (where middleware/filter provides it)

## Common Status Codes

- `400` validation or contract violations
- `401` authentication failure
- `403` authorization failure
- `404` not found (including tenant isolation-safe lookup failures)
- `409` conflict / uniqueness violations
- `429` rate limited

## Security-Sensitive Errors

- Auth recovery endpoints must return non-enumerating messages.
- Multi-tenant boundaries should not leak cross-tenant existence details.
