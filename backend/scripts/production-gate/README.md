# Production Gate

Production rehearsal using **only** `gym_management_dev`. Never touches `gym_management_test`.

## Environment

By default, gate scripts load **only** `scripts/production-gate/.env.gate`.

To also load `backend/.env` (e.g. to reuse existing dev config), set:

```bash
export GATE_LOAD_BACKEND_ENV=true
npm run gate:run
```

When `GATE_LOAD_BACKEND_ENV=true`, `backend/.env` is loaded first, then `.env.gate` (overrides).

## Setup

```bash
cp .env.gate.example .env.gate
# Edit .env.gate and fill all required values
```

## Run

```bash
cd backend
npm run gate:run
```

## Cleanup

```bash
npm run gate:cleanup
```

## Logs

`backend/tmp/gate/`

## Entry detection

Step 03 (start two instances) detects the built entry file via `find dist -type f -name 'main.js'`. If no `main.js` is found under `dist`, the script fails with a helpful message and prints the `find` output. This handles varying NestJS build output layouts.
