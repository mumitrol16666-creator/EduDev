ALTER TABLE "Deal" ADD COLUMN "implementationResponsibleId" TEXT;

ALTER TABLE "Deal"
  ADD CONSTRAINT "Deal_implementationResponsibleId_fkey"
  FOREIGN KEY ("implementationResponsibleId")
  REFERENCES "User"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

CREATE INDEX "Deal_implementationResponsibleId_idx" ON "Deal"("implementationResponsibleId");
