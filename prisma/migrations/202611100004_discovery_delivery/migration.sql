ALTER TABLE "TopicSubscription" ADD COLUMN cursor bigint NOT NULL DEFAULT 0;
CREATE TABLE "SiteMeasurement"(id text PRIMARY KEY,metric text NOT NULL CHECK(metric IN('views','errors')),"branchId" text REFERENCES "ArchiveBranch"(id),
 "periodFrom" timestamp(3) NOT NULL,"periodTo" timestamp(3) NOT NULL,count integer NOT NULL CHECK(count>=0),"sourceNote" text NOT NULL,"approvedBy" text NOT NULL,
 "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,CHECK("periodFrom"<"periodTo"));
CREATE INDEX ON "SiteMeasurement"("branchId","periodFrom","periodTo");
