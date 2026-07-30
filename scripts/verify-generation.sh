#!/bin/bash
set -e
cd /root/helmies-studio

echo "=== 1. Find API key ==="
KEY_ROW=$(psql -h localhost -p 5433 -U postgres -d helmies-studio -t -A -c 'SELECT "keyHash", "userId" FROM "ApiKey" WHERE "isActive" = true LIMIT 1;')
if [ -z "$KEY_ROW" ]; then
  echo "No active API key found"
  exit 1
fi
API_KEY=$(echo "$KEY_ROW" | cut -d'|' -f1)
USER_ID=$(echo "$KEY_ROW" | cut -d'|' -f2)
echo "Found API key: ${API_KEY:0:8}... for user: $USER_ID"

echo ""
echo "=== 2. Check user credits ==="
CREDITS=$(psql -h localhost -p 5433 -U postgres -d helmies-studio -t -A -c "SELECT credits FROM \"User\" WHERE id = '$USER_ID';")
echo "User $USER_ID credits: $CREDITS"

echo ""
echo "=== 3. Count generations before ==="
BEFORE=$(psql -h localhost -p 5433 -U postgres -d helmies-studio -t -A -c 'SELECT COUNT(*) FROM "Generation";')
echo "Before: $BEFORE"

echo ""
echo "=== 4. Trigger image generation ==="
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST http://localhost:3010/api/generate/async \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d '{"tool":"image","model":"nano-banana","prompt":"test verification - blue circle","aspect_ratio":"1:1"}')

HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | sed '$d')

echo "HTTP: $HTTP_CODE"
echo "Body: $BODY"

echo ""
echo "=== 5. Check new generation ==="
sleep 2
psql -h localhost -p 5433 -U postgres -d helmies-studio -c 'SELECT id, "requestId", status, tool, model, "createdAt" FROM "Generation" ORDER BY "createdAt" DESC LIMIT 2;'

GEN_ID=$(echo "$BODY" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
if [ -n "$GEN_ID" ]; then
  REQID=$(psql -h localhost -p 5433 -U postgres -d helmies-studio -t -A -c "SELECT \"requestId\" FROM \"Generation\" WHERE id = '$GEN_ID';")
  if [ -z "$REQID" ]; then
    echo "*** FAIL: requestId EMPTY - did NOT reach KIE ***"
  else
    echo "*** PASS: requestId=$REQID - reached KIE ***"
  fi
fi
