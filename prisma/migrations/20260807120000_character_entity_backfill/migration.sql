-- Phase C backfill (0.1.4): legacy ProjectMemory character records become
-- StudioEntity rows. Object payloads map to `attributes`, prose payloads map
-- to `description`. The original ProjectMemory rows are preserved untouched
-- (no deletes) so the legacy /api/memory surface keeps working.
-- Separate migration: the parent schema migration was already applied to the
-- live database before this data step was added (never edit applied migrations).
INSERT INTO "StudioEntity" ("id", "userId", "kind", "name", "description", "attributes", "references", "status", "createdAt", "updatedAt")
SELECT
  md5(random()::text || clock_timestamp()::text || pm."id"),
  pm."userId",
  'character',
  pm."name",
  CASE WHEN jsonb_typeof(pm."data") = 'string' THEN pm."data" #>> '{}' ELSE NULL END,
  CASE WHEN jsonb_typeof(pm."data") = 'object' THEN pm."data" ELSE '{}'::jsonb END,
  '[]'::jsonb,
  'draft',
  pm."createdAt",
  pm."updatedAt"
FROM "ProjectMemory" pm
WHERE pm."type" = 'character';
