# Anchor worker

Worker that commits completed trace Merkle batches to Solana (memo transactions on devnet). The
implementation is preserved in this package but **decoupled** from the live product: ingest does not
enqueue traces for anchoring, server trace responses do not expose anchor metadata, and the dashboard
does not show anchor or verification UI. Root Turbo `build`, `dev`, `test`, and `typecheck` scripts
exclude `@mortemlabs/anchor-worker`, so `corepack pnpm dev` at the repo root does not start it.

## Docs and entrypoint

- **Re-enable end-to-end anchoring:** [ANCHORING.md](./ANCHORING.md)
- **Entrypoint:** [src/index.ts](./src/index.ts)

## Environment

Copy [`.env.example`](./.env.example) and set at least:

- `DATABASE_URL`, Redis (`REDIS_*` or `UPSTASH_*`)
- `HELIUS_RPC_URL` (and `HELIUS_API_KEY` if your URL pattern needs it)
- `MORTEM_SIGNER_SECRET_KEY` — base58 Solana keypair secret for the memo signer

`MORTEM_SIGNER_SECRET_KEY` is **not** required for the normal Mortem app flow (ingest, server,
dashboard) when the worker is unused.

Optional tuning: `ANCHOR_WORKER_INTERVAL_MS`, `ANCHOR_WORKER_MAX_BATCH_SIZE`.

## Run locally

From the repo root:

```bash
corepack pnpm --filter @mortemlabs/anchor-worker dev
```

Build and start:

```bash
corepack pnpm --filter @mortemlabs/anchor-worker build
corepack pnpm --filter @mortemlabs/anchor-worker start
```

## Using the preserved worker

1. Read [ANCHORING.md](./ANCHORING.md) first if you want to restore the full pipeline.
2. Confirm `HELIUS_RPC_URL` (and related Helius settings) match your network.
3. Confirm `MORTEM_SIGNER_SECRET_KEY` is funded and valid on the target cluster.
4. Confirm the signer has enough lamports for transaction fees.
5. Restore ingest, server, and dashboard connections per [ANCHORING.md](./ANCHORING.md) before
   expecting new traces to reach the worker.
