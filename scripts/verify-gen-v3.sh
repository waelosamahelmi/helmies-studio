#!/bin/bash
set -e
cd /root/helmies-studio

# Use Node.js to compute the hash (same as authenticateApiKey does)
HASH=$(node -e "
const c = require('crypto');
console.log(c.createHash('sha256').update('hsk_testverify_abc123').digest('hex'));
")
echo "Computed hash: $HASH"

SQL="psql -h localhost -p 5433 -U postgres -d helmies-studio -t -A"
USER_ID="cms2mxu5x00002zktspij9of5"

echo "=== 1. Create API key with Node.js-computed hash ==="
$SQL <<EOF
DELETE FROM "ApiKey" WHERE "keyPrefix" = 'hsk_test';
INSERT INTO "ApiKey" ("id", "userId", "name", "keyHash", "keyPrefix", "isActive", "createdAt")
VALUES ('testkey_verify002', '$USER_ID', 'Verification test', '$HASH', 'hsk_test', true, NOW());
EOF

echo "=== 2. Verify key exists in DB ==="
$SQL <<EOF
SELECT "keyHash" FROM "ApiKey" WHERE "keyPrefix" = 'hsk_test' LIMIT 1;
EOF

echo ""
echo "=== 3. Count generations before ==="
BEFORE=$($SQL -c 'SELECT COUNT(*) FROM "Generation";')
echo "Before: $BEFORE"

echo ""
echo "=== 4. Trigger generation ==="
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST http://localhost:3010/api/generate/async \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer hsk_testverify_abc123" \
  -d '{"tool":"image","model":"nano-banana","prompt":"test verification - simple blue circle","aspect_ratio":"1:1"}')

HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | sed '$d')
echo "HTTP: $HTTP_CODE"
echo "Body: $BODY"

echo ""
echo "=== 5. Check new generation in DB ==="
sleep 3
$SQL <<EOF
SELECT id, "requestId", status FROM "Generation" ORDER BY "createdAt" DESC LIMIT 1;
EOF

GEN_ID=$(echo "$BODY" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
if [ -n "$GEN_ID" ]; then
  REQID=$($SQL -c "SELECT \"requestId\" FROM \"Generation\" WHERE id = '$GEN_ID';")
  if [ -z "$REQID" ]; then
    echo "*** FAIL: requestId is EMPTY — did NOT reach KIE ***"
  else
    echo "*** PASS: requestId = $REQID — reached KIE ***"
  fi
fi

echo ""
echo "=== 6. Cleanup ==="
$SQL -c "DELETE FROM \"ApiKey\" WHERE \"keyPrefix\" = 'hsk_test';"