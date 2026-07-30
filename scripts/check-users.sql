-- 1. Find a user with credits
SELECT id, email, credits FROM "User" WHERE credits > 5 LIMIT 1;

-- 2. Create an API key for that user (we'll read user ID from step 1)
-- 3. Check generations count before
SELECT COUNT(*) AS gen_count_before FROM "Generation";

-- 4. Show latest generation's requestId
SELECT id, "requestId", status, "createdAt" FROM "Generation" ORDER BY "createdAt" DESC LIMIT 1;
