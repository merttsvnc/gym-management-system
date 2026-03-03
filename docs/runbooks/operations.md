# Operations Runbook

## Health Checks

```bash
export BASE_URL="https://gym-api.quuilo.com"

curl -s -w "\nHTTP:%{http_code}\n" "$BASE_URL/health"
curl -s "$BASE_URL/health" | jq .
curl -s -i "$BASE_URL/health" | grep -i x-request-id
curl -s -i -H "X-Request-Id: test-123" "$BASE_URL/health" | grep -i x-request-id
```

Expected: `HTTP 200`, `db: "ok"`, `X-Request-Id` present and echoed.

## Logs

```bash
# API container logs
sudo docker logs --tail 200 gym-api
sudo docker logs -f gym-api

# DB container logs
sudo docker logs --tail 200 gym_api_db
```

## Incident Playbooks

### A) Migration failure during deploy

```bash
./deploy.sh force
# if migration failure persists:
./deploy.sh fix-migrations
./deploy.sh force
```

### B) Service unhealthy

```bash
curl -s -i https://gym-api.quuilo.com/health
sudo docker ps
sudo docker logs --tail 200 gym-api
```

### C) Tenant isolation sanity checks (IDOR probes)

```bash
# TOKEN_A should not access tenant B branch id
curl -s -w "\nHTTP:%{http_code}\n" "$BASE_URL/api/v1/branches/$BRANCH_B_ID" \
  -H "Authorization: Bearer $TOKEN_A"

# TOKEN_B should not access tenant A branch id
curl -s -w "\nHTTP:%{http_code}\n" "$BASE_URL/api/v1/branches/$BRANCH_A_ID" \
  -H "Authorization: Bearer $TOKEN_B"
```

Expected: cross-tenant reads are denied (`404`/not found behavior).

## Smoke Tests

```bash
# 404 error contract includes requestId/timestamp
curl -s "$BASE_URL/api/v1/nonexistent-route-xyz" | jq .

# protected route with token
curl -s -w "\nHTTP:%{http_code}\n" "$BASE_URL/api/v1/branches" \
  -H "Authorization: Bearer $TOKEN"
```

```bash
# upload smoke (requires image)
curl -s -X POST "$BASE_URL/api/v1/uploads/member-photo" \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@./test-image.jpg"
```

## Rate Limit / Brute Force Operational Check

```bash
for i in {1..12}; do
  curl -s -o /dev/null -w "%{http_code}\n" -X POST "$BASE_URL/api/v1/auth/login" \
    -H "Content-Type: application/json" \
    -d '{"email":"nope@example.com","password":"wrong"}'
done
```

Expected: throttling behavior appears; monitor logs for repeated abuse.
