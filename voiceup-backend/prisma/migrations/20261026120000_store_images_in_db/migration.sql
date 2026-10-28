-- Images are stored in the database instead of the local "uploads" folder, so they survive
-- server redeploys (for example on Render, where the local disk is temporary).
--
-- The new column is NOT NULL, so this migration only succeeds on an empty table. That is
-- intentional: existing rows would point to files on disk that the database cannot read.
-- (The development data was reset before this migration, on 26.10.2026.)

ALTER TABLE "MediaAttachment" ADD COLUMN "data" BYTEA NOT NULL;

DROP INDEX "MediaAttachment_storageKey_key";

ALTER TABLE "MediaAttachment" DROP COLUMN "storageKey";
