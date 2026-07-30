#!/bin/bash
set -e
cd /root/helmies-studio

# Use Node.js to compute hash (same as authenticateApiKey uses)
HASH=$(node -e "
const c = require('crypto');
console.log(c.createHash('sha256').update('hsk_testverify_abc123').digest('hex'));
")
echo "Computed hash: $HASH"

SQL="psql -h localhost -p 5433 -U postgres -d helmies-studio -t -A"
USER_ID="cms2mxu5x00002zktspij9of5"

echo "=== 1. Create API key ==="
$SQL <<EOF
DELETE FROM "ApiKey" WHERE "keyPrefix" = 'hsk_test';
INSERT INTO "ApiKey" ("id", "userId", "name", "keyHash", "keyPrefix", "isActive", "createdAt")
VALUES ('testkey_v4', '$USER_ID', 'Verification', '$HASH', 'hsk_test', true, NOW());
EOF

echo "=== 2. Count generations before ==="
BEFORE=$($SQL -c 'SELECT COUNT(*) FROM "Generation";')
echo "Before: $BEFORE"

echo ""
echo "=== 3. Trigger via /api/generate/image (uses generation-handler + api key auth) ==="
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST http://localhost:3010/api/generate/image \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer hsk_testverify_abc123" \
  -d '{"tool":"image","model":"nano-banana","prompt":"test verification - blue circle on white","aspect_ratio":"1:1"}')

HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | sed '$d')
echo "HTTP: $HTTP_CODE"
echo "Body: $BODY"

echo ""
echo "=== 4. Check DB ==="
sleep 3
$SQL <<EOF
SELECT id, "requestId", status, tool, model FROM "Generation" ORDER BY "createdAt" DESC LIMIT 2;
EOF

GEN_ID=$(echo "$BODY" | grep -o '"generationId":"[^"]*"' | head -1 | cut -d'"' -f4)
if [ -z "$GEN_ID" ]; then
  GEN_ID=$(echo "$BODY" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
fi

if [ -n "$GEN_ID" ]; then
  REQID=$($SQL -c "SELECT \"requestId\" FROM \"Generation\" WHERE id = '$GEN_ID';")
  if [ -z "$REQID" ]; then
    echo "*** FAIL: requestId EMPTY — did NOT reach KIE ***"
  else
    echo "*** PASS: requestId = $REQID — reached KIE ***"
  fi
else
  echo "*** FAIL: No generation ID in response ***"
fi

echo ""
echo "=== 5. Cleanup ==="
$SQL -c "DELETE FROM \"ApiKey\" WHERE \"keyPrefix\" = 'hsk_test';"