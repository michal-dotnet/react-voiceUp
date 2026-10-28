-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "ModerationStatus" AS ENUM ('PENDING_REVIEW', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ResolutionStatus" AS ENUM ('OPEN', 'UNDER_REVIEW', 'REFERRED', 'IN_PROGRESS', 'RESOLVED');

-- CreateEnum
CREATE TYPE "ContentVisibility" AS ENUM ('VISIBLE', 'HIDDEN');

-- CreateEnum
CREATE TYPE "CommentKind" AS ENUM ('COMMENT', 'REOPEN_REQUEST');

-- CreateEnum
CREATE TYPE "SolutionKind" AS ENUM ('PERSONAL_EXPERIENCE', 'SUGGESTION');

-- CreateEnum
CREATE TYPE "ReferralStatus" AS ENUM ('PREPARED', 'SENT', 'ACKNOWLEDGED');

-- CreateEnum
CREATE TYPE "ReportTargetType" AS ENUM ('ISSUE', 'COMMENT', 'SOLUTION');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('OPEN', 'ACTIONED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('ISSUE_APPROVED', 'ISSUE_REJECTED', 'STATUS_CHANGED', 'ISSUE_UPDATE', 'EXTERNAL_RESPONSE', 'ISSUE_MERGED');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "slug" VARCHAR(80) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Organization" (
    "id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "type" VARCHAR(80),
    "contactInfo" VARCHAR(500),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublicIssue" (
    "id" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "categoryId" UUID NOT NULL,
    "title" VARCHAR(150) NOT NULL,
    "description" TEXT NOT NULL,
    "area" VARCHAR(100) NOT NULL,
    "location" VARCHAR(200),
    "moderationStatus" "ModerationStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "rejectionReason" VARCHAR(500),
    "resolutionStatus" "ResolutionStatus" NOT NULL DEFAULT 'OPEN',
    "mergedIntoId" UUID,
    "publishedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PublicIssue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IssueConfirmation" (
    "id" UUID NOT NULL,
    "issueId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "note" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IssueConfirmation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IssueFollow" (
    "id" UUID NOT NULL,
    "issueId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IssueFollow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IssueComment" (
    "id" UUID NOT NULL,
    "issueId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "body" VARCHAR(2000) NOT NULL,
    "kind" "CommentKind" NOT NULL DEFAULT 'COMMENT',
    "moderationStatus" "ContentVisibility" NOT NULL DEFAULT 'VISIBLE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IssueComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProposedSolution" (
    "id" UUID NOT NULL,
    "issueId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "kind" "SolutionKind" NOT NULL,
    "body" VARCHAR(3000) NOT NULL,
    "moderationStatus" "ContentVisibility" NOT NULL DEFAULT 'VISIBLE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProposedSolution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaAttachment" (
    "id" UUID NOT NULL,
    "issueId" UUID NOT NULL,
    "uploaderId" UUID NOT NULL,
    "storageKey" VARCHAR(100) NOT NULL,
    "mimeType" VARCHAR(50) NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MediaAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IssueAssignment" (
    "id" UUID NOT NULL,
    "issueId" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "assignedById" UUID NOT NULL,
    "referralStatus" "ReferralStatus" NOT NULL DEFAULT 'PREPARED',
    "sentAt" TIMESTAMP(3),
    "sentMethod" VARCHAR(100),
    "sentEvidence" VARCHAR(1000),
    "ackAt" TIMESTAMP(3),
    "ackEvidence" VARCHAR(1000),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IssueAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalResponse" (
    "id" UUID NOT NULL,
    "assignmentId" UUID NOT NULL,
    "recordedById" UUID NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "summary" VARCHAR(2000) NOT NULL,
    "evidenceNote" VARCHAR(1000) NOT NULL,
    "evidenceUrl" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExternalResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IssueStatusHistory" (
    "id" UUID NOT NULL,
    "issueId" UUID NOT NULL,
    "fromStatus" "ResolutionStatus" NOT NULL,
    "toStatus" "ResolutionStatus" NOT NULL,
    "changedById" UUID NOT NULL,
    "note" VARCHAR(2000) NOT NULL,
    "source" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IssueStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IssueMergeHistory" (
    "id" UUID NOT NULL,
    "sourceIssueId" UUID NOT NULL,
    "canonicalIssueId" UUID NOT NULL,
    "mergedById" UUID NOT NULL,
    "reason" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IssueMergeHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentReport" (
    "id" UUID NOT NULL,
    "reporterId" UUID NOT NULL,
    "targetType" "ReportTargetType" NOT NULL,
    "targetId" UUID NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "status" "ReportStatus" NOT NULL DEFAULT 'OPEN',
    "handledById" UUID,
    "handledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContentReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "type" "NotificationType" NOT NULL,
    "issueId" UUID,
    "message" VARCHAR(300) NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "action" VARCHAR(60) NOT NULL,
    "entityType" VARCHAR(40) NOT NULL,
    "entityId" UUID NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Category_name_key" ON "Category"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Category_slug_key" ON "Category"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Organization_name_key" ON "Organization"("name");

-- CreateIndex
CREATE INDEX "PublicIssue_moderationStatus_mergedIntoId_createdAt_idx" ON "PublicIssue"("moderationStatus", "mergedIntoId", "createdAt");

-- CreateIndex
CREATE INDEX "PublicIssue_categoryId_idx" ON "PublicIssue"("categoryId");

-- CreateIndex
CREATE INDEX "PublicIssue_area_idx" ON "PublicIssue"("area");

-- CreateIndex
CREATE INDEX "PublicIssue_authorId_idx" ON "PublicIssue"("authorId");

-- CreateIndex
CREATE INDEX "PublicIssue_mergedIntoId_idx" ON "PublicIssue"("mergedIntoId");

-- CreateIndex
CREATE INDEX "IssueConfirmation_userId_idx" ON "IssueConfirmation"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "IssueConfirmation_issueId_userId_key" ON "IssueConfirmation"("issueId", "userId");

-- CreateIndex
CREATE INDEX "IssueFollow_userId_idx" ON "IssueFollow"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "IssueFollow_issueId_userId_key" ON "IssueFollow"("issueId", "userId");

-- CreateIndex
CREATE INDEX "IssueComment_issueId_createdAt_idx" ON "IssueComment"("issueId", "createdAt");

-- CreateIndex
CREATE INDEX "ProposedSolution_issueId_createdAt_idx" ON "ProposedSolution"("issueId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MediaAttachment_storageKey_key" ON "MediaAttachment"("storageKey");

-- CreateIndex
CREATE INDEX "MediaAttachment_issueId_idx" ON "MediaAttachment"("issueId");

-- CreateIndex
CREATE INDEX "IssueAssignment_organizationId_idx" ON "IssueAssignment"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "IssueAssignment_issueId_organizationId_key" ON "IssueAssignment"("issueId", "organizationId");

-- CreateIndex
CREATE INDEX "ExternalResponse_assignmentId_idx" ON "ExternalResponse"("assignmentId");

-- CreateIndex
CREATE INDEX "IssueStatusHistory_issueId_createdAt_idx" ON "IssueStatusHistory"("issueId", "createdAt");

-- CreateIndex
CREATE INDEX "IssueMergeHistory_canonicalIssueId_idx" ON "IssueMergeHistory"("canonicalIssueId");

-- CreateIndex
CREATE INDEX "IssueMergeHistory_sourceIssueId_idx" ON "IssueMergeHistory"("sourceIssueId");

-- CreateIndex
CREATE INDEX "ContentReport_status_createdAt_idx" ON "ContentReport"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ContentReport_targetType_targetId_idx" ON "ContentReport"("targetType", "targetId");

-- CreateIndex
CREATE UNIQUE INDEX "ContentReport_reporterId_targetType_targetId_key" ON "ContentReport"("reporterId", "targetType", "targetId");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_createdAt_idx" ON "Notification"("userId", "readAt", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- AddForeignKey
ALTER TABLE "PublicIssue" ADD CONSTRAINT "PublicIssue_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublicIssue" ADD CONSTRAINT "PublicIssue_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublicIssue" ADD CONSTRAINT "PublicIssue_mergedIntoId_fkey" FOREIGN KEY ("mergedIntoId") REFERENCES "PublicIssue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssueConfirmation" ADD CONSTRAINT "IssueConfirmation_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "PublicIssue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssueConfirmation" ADD CONSTRAINT "IssueConfirmation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssueFollow" ADD CONSTRAINT "IssueFollow_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "PublicIssue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssueFollow" ADD CONSTRAINT "IssueFollow_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssueComment" ADD CONSTRAINT "IssueComment_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "PublicIssue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssueComment" ADD CONSTRAINT "IssueComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProposedSolution" ADD CONSTRAINT "ProposedSolution_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "PublicIssue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProposedSolution" ADD CONSTRAINT "ProposedSolution_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAttachment" ADD CONSTRAINT "MediaAttachment_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "PublicIssue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAttachment" ADD CONSTRAINT "MediaAttachment_uploaderId_fkey" FOREIGN KEY ("uploaderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssueAssignment" ADD CONSTRAINT "IssueAssignment_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "PublicIssue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssueAssignment" ADD CONSTRAINT "IssueAssignment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssueAssignment" ADD CONSTRAINT "IssueAssignment_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalResponse" ADD CONSTRAINT "ExternalResponse_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "IssueAssignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalResponse" ADD CONSTRAINT "ExternalResponse_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssueStatusHistory" ADD CONSTRAINT "IssueStatusHistory_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "PublicIssue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssueStatusHistory" ADD CONSTRAINT "IssueStatusHistory_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssueMergeHistory" ADD CONSTRAINT "IssueMergeHistory_sourceIssueId_fkey" FOREIGN KEY ("sourceIssueId") REFERENCES "PublicIssue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssueMergeHistory" ADD CONSTRAINT "IssueMergeHistory_canonicalIssueId_fkey" FOREIGN KEY ("canonicalIssueId") REFERENCES "PublicIssue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssueMergeHistory" ADD CONSTRAINT "IssueMergeHistory_mergedById_fkey" FOREIGN KEY ("mergedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentReport" ADD CONSTRAINT "ContentReport_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentReport" ADD CONSTRAINT "ContentReport_handledById_fkey" FOREIGN KEY ("handledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "PublicIssue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
