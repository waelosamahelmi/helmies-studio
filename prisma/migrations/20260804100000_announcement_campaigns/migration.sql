-- EDITSv1 Phase E8 Task E8.1: SiteAnnouncement becomes a campaign object.
--
-- Additive and safe on a live table: every new column is NOT NULL WITH a
-- DEFAULT (so existing rows are backfilled in place) or plainly nullable.
-- Nothing that already renders stops rendering.

-- AlterTable
ALTER TABLE "SiteAnnouncement"
    ADD COLUMN "placement"   TEXT    NOT NULL DEFAULT 'banner',
    ADD COLUMN "title"       TEXT,
    ADD COLUMN "imageUrl"    TEXT,
    ADD COLUMN "ctaLabel"    TEXT,
    ADD COLUMN "ctaUrl"      TEXT,
    ADD COLUMN "dismissible" BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN "priority"    INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "planTargets" TEXT[]  NOT NULL DEFAULT ARRAY[]::TEXT[],
    ADD COLUMN "impressions" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "clicks"      INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
-- Exactly the predicates /api/announcements filters on for every page load.
-- This table previously carried no index whatsoever.
CREATE INDEX "SiteAnnouncement_isActive_startDate_endDate_idx"
    ON "SiteAnnouncement"("isActive", "startDate", "endDate");

-- DataMigration
-- `audience` was written by the admin form and never read, so the values on
-- disk come from an older vocabulary ("all" | "free" | "paid") while the
-- audience filter introduced in this phase speaks "all" | "anon" | "authed".
-- Every one of those rows was, under the ignored-audience behaviour, visible
-- to EVERYONE — so "all" is the value that preserves what users actually saw.
-- (The runtime filter is an exclusion list and would have kept them visible
-- anyway; this normalises the stored value so the admin edit form does not
-- silently rewrite it on the next save.)
UPDATE "SiteAnnouncement" SET "audience" = 'all'
    WHERE "audience" NOT IN ('all', 'anon', 'authed');

-- CreateTable
CREATE TABLE "AnnouncementDismissal" (
    "id" TEXT NOT NULL,
    "announcementId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dismissedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnnouncementDismissal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AnnouncementDismissal_announcementId_userId_key"
    ON "AnnouncementDismissal"("announcementId", "userId");

-- CreateIndex
CREATE INDEX "AnnouncementDismissal_userId_idx" ON "AnnouncementDismissal"("userId");

-- AddForeignKey
ALTER TABLE "AnnouncementDismissal" ADD CONSTRAINT "AnnouncementDismissal_announcementId_fkey"
    FOREIGN KEY ("announcementId") REFERENCES "SiteAnnouncement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnnouncementDismissal" ADD CONSTRAINT "AnnouncementDismissal_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
