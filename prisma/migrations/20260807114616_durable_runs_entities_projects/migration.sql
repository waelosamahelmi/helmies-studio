-- AlterTable
ALTER TABLE "AgentRun" ADD COLUMN     "cancelRequested" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "engine" TEXT NOT NULL DEFAULT 'durable',
ADD COLUMN     "maxCredits" INTEGER,
ADD COLUMN     "qcMode" TEXT NOT NULL DEFAULT 'off',
ADD COLUMN     "tier" TEXT;

-- AlterTable
ALTER TABLE "AgentSession" ADD COLUMN     "projectId" TEXT;

-- AlterTable
ALTER TABLE "Asset" ADD COLUMN     "projectId" TEXT;

-- AlterTable
ALTER TABLE "DirectorPipeline" ADD COLUMN     "cancelRequested" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "concurrency" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "projectId" TEXT;

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "brief" TEXT,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'active';

-- AlterTable
ALTER TABLE "Template" ADD COLUMN     "userId" TEXT;

-- AlterTable
ALTER TABLE "Workflow" ADD COLUMN     "projectId" TEXT;

-- CreateTable
CREATE TABLE "AgentRunStep" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "stepIndex" INTEGER NOT NULL,
    "stepId" TEXT NOT NULL,
    "agent" TEXT NOT NULL,
    "task" TEXT NOT NULL,
    "params" JSONB,
    "dependsOn" JSONB NOT NULL DEFAULT '[]',
    "kind" TEXT NOT NULL DEFAULT 'media',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "generationId" TEXT,
    "output" JSONB,
    "outputUrl" TEXT,
    "creditsQuoted" INTEGER NOT NULL DEFAULT 0,
    "creditsActual" INTEGER,
    "modelPlanned" TEXT,
    "modelUsed" TEXT,
    "substitution" TEXT,
    "error" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentRunStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudioEntity" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "attributes" JSONB NOT NULL DEFAULT '{}',
    "references" JSONB NOT NULL DEFAULT '[]',
    "voiceId" TEXT,
    "voiceName" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "fingerprint" TEXT,
    "projectId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudioEntity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AgentRunStep_runId_status_idx" ON "AgentRunStep"("runId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AgentRunStep_runId_stepId_key" ON "AgentRunStep"("runId", "stepId");

-- CreateIndex
CREATE INDEX "StudioEntity_userId_kind_idx" ON "StudioEntity"("userId", "kind");

-- CreateIndex
CREATE INDEX "StudioEntity_projectId_idx" ON "StudioEntity"("projectId");

-- CreateIndex
CREATE INDEX "AgentRun_userId_status_idx" ON "AgentRun"("userId", "status");

-- CreateIndex
CREATE INDEX "AgentSession_projectId_idx" ON "AgentSession"("projectId");

-- CreateIndex
CREATE INDEX "Asset_userId_isDeleted_type_idx" ON "Asset"("userId", "isDeleted", "type");

-- CreateIndex
CREATE INDEX "Asset_projectId_idx" ON "Asset"("projectId");

-- CreateIndex
CREATE INDEX "DirectorPipeline_userId_idx" ON "DirectorPipeline"("userId");

-- CreateIndex
CREATE INDEX "DirectorPipeline_projectId_idx" ON "DirectorPipeline"("projectId");

-- CreateIndex
CREATE INDEX "DirectorShot_pipelineId_idx" ON "DirectorShot"("pipelineId");

-- CreateIndex
CREATE INDEX "Generation_userId_status_idx" ON "Generation"("userId", "status");

-- CreateIndex
CREATE INDEX "Generation_userId_tool_status_idx" ON "Generation"("userId", "tool", "status");

-- CreateIndex
CREATE INDEX "Project_userId_updatedAt_idx" ON "Project"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "ProjectMemory_userId_type_idx" ON "ProjectMemory"("userId", "type");

-- CreateIndex
CREATE INDEX "Template_userId_idx" ON "Template"("userId");

-- CreateIndex
CREATE INDEX "Workflow_projectId_idx" ON "Workflow"("projectId");

-- AddForeignKey
ALTER TABLE "AgentRunStep" ADD CONSTRAINT "AgentRunStep_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AgentRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentSession" ADD CONSTRAINT "AgentSession_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Workflow" ADD CONSTRAINT "Workflow_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudioEntity" ADD CONSTRAINT "StudioEntity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudioEntity" ADD CONSTRAINT "StudioEntity_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectorPipeline" ADD CONSTRAINT "DirectorPipeline_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
