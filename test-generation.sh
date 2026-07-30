#!/bin/bash
# Test generation pipeline end-to-end on server
echo "=== Catalog: text-to-image models ==="
curl -s "http://localhost:3010/api/models/catalog?type=image&capability=text-to-image" | python3 -c "
import sys, json
d = json.load(sys.stdin)
for m in d.get('models', [])[:5]:
    print(f\"  {m['id']}  (providerModelId: {m.get('providerModelId','N/A')})\")
"

echo ""
echo "=== Test 1: async route generation ==="
RESULT=$(curl -s -w "\n%{http_code}" -X POST http://localhost:3010/api/generate/async \
  -H "Content-Type: application/json" \
  -H "X-API-Key: ht-fc4023b56e9c20909acb0419d774bd009a50bad90fa44f59" \
  -d '{"tool":"image","model":"flux2/pro-text-to-image","prompt":"a serene mountain lake at sunset, cinematic lighting"}')
HTTP_CODE=$(echo "$RESULT" | tail -1)
BODY=$(echo "$RESULT" | head -n -1)
echo "  HTTP: $HTTP_CODE"
echo "  Body: $BODY"

echo ""
echo "=== Test 2: direct KIE check (was API back?) ==="
KIE_RESULT=$(curl -s -w "\n%{http_code}" -X POST https://api.kie.ai/api/v1/jobs/createTask \
  -H "Authorization: Bearer $KIE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"flux2/pro-text-to-image","input":{"prompt":"test","aspect_ratio":"1:1"}}' \
  --max-time 10)
KIE_CODE=$(echo "$KIE_RESULT" | tail -1)
KIE_BODY=$(echo "$KIE_RESULT" | head -n -1 | python3 -c "import sys,json; d=json.load(sys.stdin); print(json.dumps({k:d.get(k) for k in ['code','msg','data'] if k in d}))" 2>/dev/null || echo "$KIE_RESULT" | head -1)
echo "  HTTP: $KIE_CODE"
echo "  Body: $KIE_BODY"

echo ""
echo "=== PM2 recent errors ==="
pm2 logs helmies-studio --lines 5 --nostream 2>&1 | grep -i "error\|provider\|fail" | tail -5
