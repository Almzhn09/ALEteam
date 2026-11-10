CREATE TABLE "DiscoveryFact"(id text PRIMARY KEY, kind text NOT NULL CHECK(kind IN('PLACE','ALIAS','TOPIC','LINK','HISTORY','EDITORIAL')),
 "branchId" text REFERENCES "ArchiveBranch"(id),"parentId" text REFERENCES "DiscoveryFact"(id),data jsonb NOT NULL,sources jsonb NOT NULL,
 status text NOT NULL DEFAULT 'DRAFT' CHECK(status IN('DRAFT','VERIFIED','WITHDRAWN')),"authorId" text NOT NULL,"reviewerId" text,
 "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK(status<>'VERIFIED' OR ("reviewerId" IS NOT NULL AND "reviewerId"<>"authorId")));
CREATE INDEX ON "DiscoveryFact"(kind,status,id); CREATE INDEX ON "DiscoveryFact"("parentId",status,id);
CREATE TABLE "SourceDraftBatch"(id text PRIMARY KEY,digest text NOT NULL,mode text NOT NULL,manifest jsonb NOT NULL,report jsonb NOT NULL,status text NOT NULL,
 "authorId" text NOT NULL,"createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"committedAt" timestamp(3));
CREATE INDEX ON "SourceDraftBatch"("authorId","createdAt");
CREATE TABLE "SourceDraftBinding"(id text PRIMARY KEY,namespace text NOT NULL,"sourceKey" text NOT NULL,locale text NOT NULL CHECK(locale IN('ru','kk','en')),
 "requestHash" text NOT NULL,"sourceHash" text NOT NULL,"itemId" text NOT NULL REFERENCES "ContentItem"(id),"revisionId" text NOT NULL REFERENCES "ContentRevision"(id),
 "branchId" text,original jsonb NOT NULL,"createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(namespace,"sourceKey",locale));
CREATE INDEX ON "SourceDraftBinding"("itemId");
CREATE TABLE "DiscoveryPreference"("userId" text PRIMARY KEY REFERENCES "User"(id) ON DELETE CASCADE,"topicIds" text[] NOT NULL DEFAULT '{}',
 "personalizationEnabled" boolean NOT NULL DEFAULT false,"historyEnabled" boolean NOT NULL DEFAULT false,"updatedAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE "TopicSubscription"(id text PRIMARY KEY,"userId" text NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,fingerprint text NOT NULL,spec jsonb NOT NULL,
 active boolean NOT NULL DEFAULT true,baseline bigint NOT NULL,"createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE("userId",fingerprint));
CREATE INDEX ON "TopicSubscription"(active,baseline);
CREATE TABLE "MaterialPublication"(sequence bigserial PRIMARY KEY,kind text NOT NULL CHECK(kind IN('document','cms')),"materialId" text NOT NULL,locale text NOT NULL,
 revision text NOT NULL,"createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(kind,"materialId",locale,revision));
CREATE TABLE "TopicNotice"(id text PRIMARY KEY,"subscriptionId" text NOT NULL REFERENCES "TopicSubscription"(id) ON DELETE CASCADE,"materialKey" text NOT NULL,
 "publicationSequence" bigint NOT NULL,"readAt" timestamp(3),"createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE("subscriptionId","materialKey"));
CREATE INDEX ON "TopicNotice"("subscriptionId","createdAt",id);
CREATE TABLE "DiscoveryAggregate"(id text PRIMARY KEY,kind text NOT NULL CHECK(kind IN('document','cms')),"materialId" text NOT NULL,locale text NOT NULL,
 "periodFrom" timestamp(3) NOT NULL,"periodTo" timestamp(3) NOT NULL,count integer NOT NULL CHECK(count>=0),"approvedBy" text NOT NULL,"sourceNote" text NOT NULL,
 "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,CHECK("periodFrom"<"periodTo"),UNIQUE(kind,"materialId",locale,"periodFrom","periodTo"));
