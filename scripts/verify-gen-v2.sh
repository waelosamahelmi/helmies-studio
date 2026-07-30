#!/bin/bash
set -e

# Compute SHA256 hash of the test API key
RAW_KEY="hsk_testverify_abc123"
KEY_HASH=$(echo -n "$RAW_KEY" | sha256sum | awk '{print $1}')

USER_ID="cms2mxu5x00002zktspij9of5"
SQL="psql -h localhost -p 5433 -U postgres -d helmies-studio -t -A"

echo "=== 1. Create test API key ==="
$SQL <<EOF
DELETE FROM "ApiKey" WHERE "keyPrefix" = 'hsk_test';
INSERT INTO "ApiKey" ("id", "userId", "name", "keyHash", "keyPrefix", "isActive", "createdAt")
VALUES ('testkey_verify001', '$USER_ID', 'Verification test', '$KEY_HASH', 'hsk_test', true, NOW())
ON CONFLICT DO NOTHING;
EOF
echo "API key created (keyHash=$KEY_HASH)"

echo ""
echo "=== 2. Count generations before ==="
BEFORE=$($SQL -c 'SELECT COUNT(*) FROM "Generation";')
echo "Before: $BEFORE"

echo ""
echo "=== 3. Trigger image generation ==="
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST http://localhost:3010/api/generate/async \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $RAW_KEY" \
  -d '{"tool":"image","model":"nano-banana","prompt":"test verification - simple blue circle","aspect_ratio":"1:1"}')

HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | sed '$d')

echo "HTTP: $HTTP_CODE"
echo "Body: $BODY"

GEN_ID=$(echo "$BODY" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
echo "Generation ID: $GEN_ID"

echo ""
echo "=== 4. Check DB after generation ==="
sleep 3

AFTER=$($SQL -c 'SELECT COUNT(*) FROM "Generation";')
echo "After: $AFTER (delta: $((AFTER - BEFORE)))"

if [ -n "$GEN_ID" ]; then
  echo ""
  REQID=$($SQL -c "SELECT \"requestId\" FROM \"Generation\" WHERE id = '$GEN_ID';")
  echo "requestId for $GEN_ID: '$REQID'"
  
  if [ -z "$REQID" ]; then
    echo "*** FAIL: requestId is EMPTY — generation did NOT reach KIE ***"
  else
    echo "*** PASS: requestId = $REQID — generation reached KIE ***"
  fi
fi

echo ""
echo "=== 5. Latest 3 generations ==="
$SQL <<EOF
SELECT id, "requestId", status, tool, model, "createdAt" FROM "Generation" ORDER BY "createdAt" DESC LIMIT 3;
EOF

echo ""
echo "=== 6. Cleanup test key ==="
$SQL -c "DELETE FROM \"ApiKey\" WHERE \"keyPrefix\" = 'hsk_test';"
echo "Done."
