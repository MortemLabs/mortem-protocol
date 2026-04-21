ALTER TABLE "Agent"
ADD COLUMN "verifyToken" TEXT,
ADD COLUMN "verified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "verifiedAt" TIMESTAMP(3);

UPDATE "Agent"
SET "verifyToken" = CONCAT('mrt_verify_', SUBSTRING(MD5(id) FROM 1 FOR 8))
WHERE "verifyToken" IS NULL;

ALTER TABLE "Agent"
ALTER COLUMN "verifyToken" SET NOT NULL;

CREATE UNIQUE INDEX "Agent_verifyToken_key" ON "Agent"("verifyToken");
