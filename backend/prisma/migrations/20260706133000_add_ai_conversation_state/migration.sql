ALTER TABLE "Lead" ADD COLUMN "aiConversationState" TEXT;
ALTER TABLE "Lead" ADD COLUMN "aiConversationStateUpdatedAt" TIMESTAMP(3);

CREATE INDEX "Lead_aiConversationState_idx" ON "Lead"("aiConversationState");
