# Reports API

## Scope

- Revenue endpoints
- Dashboard/reporting metrics
- Timezone-aware aggregation
- Revenue trend and breakdown reports

## Endpoints

- Revenue and dashboard report endpoints under `/payments`, `/reports`, and related modules
  as implemented in backend.

## Metric Integrity

- Definitions for active/expired/expiring counts must be consistent across endpoints.
- Monthly boundaries must use explicit timezone handling.
- SQL and service-level aggregation rules must produce deterministic totals.

## Operational Notes

- Large-range queries should use indexed paths and bounded date windows.
- Reporting contracts should document locked-month behavior where applicable.
