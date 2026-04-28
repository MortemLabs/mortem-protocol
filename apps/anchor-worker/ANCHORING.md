# Re-enabling On-Chain Anchoring

This worker was decoupled on April 28, 2026. To re-enable:

1. In `apps/ingest`: restore `LPUSH` to `anchor:pending` after trace completion in `POST /v1/traces/batch`

2. In `apps/server`: restore `anchorSignature`, `anchorSlot`, `merkleProof`, `traceHash` to trace tRPC responses. Restore the verify router. Restore `lib/pda.ts`.

3. In `apps/dashboard`: restore the anchor status panel, Verify button, and verification block on the share page.

4. Add `apps/anchor-worker` back to the Turbo pipeline and deployment configs.

5. Fund `MORTEM_SIGNER_SECRET_KEY` with devnet SOL.

The worker code itself is unchanged and ready to run.
