-- Database-level guarantees that back the application rules.
-- Prisma does not model CHECK constraints, so they live in this hand-written migration.

-- An issue can never be merged into itself.
ALTER TABLE "PublicIssue"
  ADD CONSTRAINT "PublicIssue_not_merged_into_self" CHECK ("mergedIntoId" IS NULL OR "mergedIntoId" <> "id");

-- A referral marked SENT or ACKNOWLEDGED must carry its date, method and evidence.
ALTER TABLE "IssueAssignment"
  ADD CONSTRAINT "IssueAssignment_sent_requires_evidence" CHECK (
    "referralStatus" = 'PREPARED'
    OR ("sentAt" IS NOT NULL AND "sentMethod" IS NOT NULL AND "sentEvidence" IS NOT NULL)
  );

-- An acknowledged referral must carry the acknowledgement date and evidence.
ALTER TABLE "IssueAssignment"
  ADD CONSTRAINT "IssueAssignment_ack_requires_evidence" CHECK (
    "referralStatus" <> 'ACKNOWLEDGED' OR ("ackAt" IS NOT NULL AND "ackEvidence" IS NOT NULL)
  );

-- A resolved issue always has a resolution date.
ALTER TABLE "PublicIssue"
  ADD CONSTRAINT "PublicIssue_resolved_has_date" CHECK (
    "resolutionStatus" <> 'RESOLVED' OR "resolvedAt" IS NOT NULL
  );
