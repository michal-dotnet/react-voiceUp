-- CreateTable
CREATE TABLE "GuestConfirmation" (
    "id" UUID NOT NULL,
    "issueId" UUID NOT NULL,
    "guestKeyHash" CHAR(64) NOT NULL,
    "ipHash" CHAR(64) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GuestConfirmation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GuestConfirmation_issueId_ipHash_idx" ON "GuestConfirmation"("issueId", "ipHash");

-- CreateIndex
CREATE UNIQUE INDEX "GuestConfirmation_issueId_guestKeyHash_key" ON "GuestConfirmation"("issueId", "guestKeyHash");

-- AddForeignKey
ALTER TABLE "GuestConfirmation" ADD CONSTRAINT "GuestConfirmation_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "PublicIssue"("id") ON DELETE CASCADE ON UPDATE CASCADE;
