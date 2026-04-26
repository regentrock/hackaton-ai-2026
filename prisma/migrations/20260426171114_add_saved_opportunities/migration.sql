-- CreateTable
CREATE TABLE "SavedOpportunity" (
    "id" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "organization" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "skills" TEXT[],
    "theme" TEXT,
    "matchScore" INTEGER,
    "projectLink" TEXT,
    "savedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "volunteerId" TEXT NOT NULL,

    CONSTRAINT "SavedOpportunity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SavedOpportunity_volunteerId_idx" ON "SavedOpportunity"("volunteerId");

-- CreateIndex
CREATE INDEX "SavedOpportunity_savedAt_idx" ON "SavedOpportunity"("savedAt");

-- CreateIndex
CREATE UNIQUE INDEX "SavedOpportunity_volunteerId_opportunityId_key" ON "SavedOpportunity"("volunteerId", "opportunityId");

-- AddForeignKey
ALTER TABLE "SavedOpportunity" ADD CONSTRAINT "SavedOpportunity_volunteerId_fkey" FOREIGN KEY ("volunteerId") REFERENCES "Volunteer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
