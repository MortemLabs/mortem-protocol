-- Remove obsolete PDA registry columns now that memo transactions replace the custom Anchor program.
-- Existing trace anchoring fields remain on Trace because memo signatures and Merkle proofs still persist.
ALTER TABLE "User" DROP COLUMN IF EXISTS "userPda";

ALTER TABLE "Agent"
  DROP COLUMN IF EXISTS "registryPda",
  DROP COLUMN IF EXISTS "userPda";
