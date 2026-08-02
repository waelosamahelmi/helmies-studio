-- Phase 6 Task 3: template runs execute on the Phase 4A durable job queue.
-- TemplateRun is a standalone, id-addressed table like GenerationJob (no FK
-- to User/Template/TemplateVersion — see the model's comment in
-- schema.prisma). Additive only — no existing table is touched.

-- CreateTable
CREATE TABLE "TemplateRun" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "stepState" JSONB NOT NULL,
    "totalCredits" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TemplateRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TemplateRun_userId_status_idx" ON "TemplateRun"("userId", "status");
