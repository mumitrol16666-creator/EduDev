ALTER TABLE "Lead" ADD COLUMN "aiStatus" TEXT;
ALTER TABLE "Lead" ADD COLUMN "aiStatusUpdatedAt" TIMESTAMP(3);
ALTER TABLE "Lead" ADD COLUMN "aiNextAction" TEXT;
ALTER TABLE "Lead" ADD COLUMN "aiSummary" TEXT;
ALTER TABLE "Lead" ADD COLUMN "aiProfile" JSONB NOT NULL DEFAULT '{}';

ALTER TABLE "Task" ADD COLUMN "description" TEXT;

CREATE INDEX "Lead_aiStatus_idx" ON "Lead"("aiStatus");
CREATE INDEX "Lead_aiStatusUpdatedAt_idx" ON "Lead"("aiStatusUpdatedAt");
