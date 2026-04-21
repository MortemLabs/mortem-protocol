# Mortem

Mortem is an observability and debugging platform for TypeScript AI agents running on Solana.

It captures agent traces, LLM calls, tool calls, Solana transactions, and custom events. It stores
those traces in Postgres, streams them live to a dashboard, analyzes failures with an LLM, and can
anchor trace batches on Solana with Merkle roots.

The project is a pnpm monorepo powered by Turborepo, strict TypeScript, Prisma, Fastify, Next.js,
Privy, Upstash Redis, and Solana memo transactions for anchoring.

## What Mortem Does

Mortem helps answer a few practical questions when an AI agent fails:

- What did the agent see?
- What did the agent call?
- Which Solana transactions did it send?
- What market context or tool output was available at the time?
- Was the failure avoidable?
- Can this trace be verified against a memo-backed Merkle commitment on Solana?

The core flow is:

```text
TypeScript agent
  -> @mortemlabs/sdk
  -> ingest service
  -> Postgres traces and events
  -> dashboard, live stream, analysis worker
  -> anchor worker
  -> Solana memo transaction
```

## Repository Structure

```text
.
├── apps
│   ├── dashboard          Next.js dashboard and public share pages
│   ├── server             Next.js tRPC API, analysis worker, and Helius webhook helpers
│   ├── ingest             Fastify trace ingestion and live SSE service
│   ├── anchor-worker      Worker that commits Merkle trace batches as Solana memo transactions
│   └── enrichment-worker  Helius webhook worker for Solana transaction enrichment
├── packages
│   ├── shared             Shared types, Zod schemas, canonical JSON, hashing, Merkle utilities
│   ├── db                 Prisma schema, migrations, and Prisma client singleton
│   └── sdk                Public TypeScript SDK and instrumentation wrappers
├── turbo.json             Turborepo task graph
├── biome.json             Biome lint and format config
└── pnpm-workspace.yaml    pnpm workspace package layout
```

## Architecture

### SDK

`@mortemlabs/sdk` is the library used by agent code. It is intentionally light: it has no hard
dependency on OpenAI, Anthropic, Ollama, LangChain, Vercel AI SDK, or Solana SDK packages.

It provides:

- `Mortem` client
- `Session` trace lifecycle
- event builders for `llm_call`, `tool_call`, `solana_tx`, `x402_payment`, `mcp_call`, and `custom`
- wrappers for OpenAI, Anthropic, Ollama, Vercel AI SDK tools/models, LangChain callbacks, and Solana connections
- gzip buffering with retries
- best-effort behavior so SDK failures do not crash the agent
- optional AES-256-GCM payload encryption with `MORTEM_MASTER_KEY`

### Ingest Service

`apps/ingest` is a Fastify service. It accepts trace batches from the SDK.

Main routes:

```text
GET  /healthz
POST /v1/traces/batch
POST /v1/traces/:id/complete
GET  /v1/agents/:id/live
```

The batch route validates input with Zod, resolves API keys, rate limits by agent, writes traces and
events through Prisma, pushes live updates to Redis, and queues completed traces for analysis and
anchoring.

### API Server

`apps/server` is a Next.js app that exposes tRPC at:

```text
http://localhost:3001/api/trpc
```

Routers:

- `agents`: list, get, create, rotate API key, check onboarding connection state, delete
- `traces`: list, get, share, unshare, delete
- `analysis`: get and rerun trace analysis
- `verify`: public trace lookup by share token

Privy is frontend-only for login. The browser sends a Privy JWT with tRPC calls, and the server only
uses `verifyAuthToken` to verify that JWT.

When an agent is created with an `agentWallet`, the server also updates the configured Helius webhook
watchlist so that wallet enrichment stays in sync without hardcoding webhook settings.

### Dashboard

`apps/dashboard` is the user interface.

Routes:

```text
/                         Landing page
/login                    Privy login
/app                      Agent list
/app/agents/[id]          Agent detail and live stream
/app/agents/[id]/traces   Trace list
/app/agents/[id]/settings Agent settings and API keys
/app/agents/new           Agent onboarding wizard
/app/traces/[id]          Trace detail
/share/[token]            Public shared trace
```

The dashboard uses Privy for login, tRPC for application data, and SSE for live trace updates.

The primary first-run path is `/app/agents/new`, a four-step onboarding wizard:

1. Create the agent and reveal the plaintext API key one time.
2. Install `@mortemlabs/sdk` with prefilled environment values.
3. Copy a minimal integration snippet or an AI-assistant prompt with the real credentials.
4. Poll for the first trace until the agent shows as connected and verified.

### Database

`packages/db` owns the Prisma schema and generated client. The schema models:

- `User`
- `Agent`
- `AgentOwner`
- `Trace`
- `TraceEvent`
- `TraceAnalysis`

All application database access goes through Prisma.

### Redis

Upstash Redis is used for short-lived caches, queues, live events, and worker signals.

Important keys:

```text
apikey:{hash}              Agent API key cache
live:{agentId}             Last 1000 live trace batches
pubsub:live:{agentId}      Live stream notifications
agent:connected            First-trace signal for a newly connected agent
anchor:pending             Trace IDs waiting for memo anchoring
analysis:pending           Trace IDs waiting for LLM analysis
analysis:ready:{traceId}   Analysis completion signal
ratelimit:{agentId}:{min}  Ingest rate limit counter
trace:{traceId}            Cached trace JSON
```

For local development, some services have in-memory Redis fallbacks when Upstash credentials are not
present. Postgres is still required for real app flows.

### LLM Analysis

The analysis worker lives in `apps/server/src/server/analysis-worker.ts`.

It polls `analysis:pending`, fetches trace context from Postgres, calls the configured LLM provider,
writes `TraceAnalysis`, and publishes `analysis:ready:{traceId}`.

Provider selection is controlled by `LLM_PROVIDER`:

```text
LLM_PROVIDER=ollama
LLM_PROVIDER=anthropic
```

Ollama is the default and uses the hosted cloud API — no local installation needed. Set
`OLLAMA_API_KEY` and `OLLAMA_MODEL`. Anthropic requires `ANTHROPIC_API_KEY`.

### Memo Anchoring

Mortem now anchors Merkle roots with the native Solana Memo program instead of a custom on-chain
program.

The verification chain is:

```text
memo transaction
  -> JSON memo payload
  -> merkleRoot
  -> Merkle proof
  -> trace hash
```

Each memo payload includes:

- `agentId`
- `batchIndex`
- `merkleRoot`
- `traceCount`
- `ts`

Anyone can inspect the memo transaction in Explorer and recompute the proof locally.

There is no custom Solana program in this repository. The previous Anchor program and PDA flow were
replaced entirely by native memo transactions.

## Prerequisites

Install these before running the full stack:

- Node.js 22 or newer
- pnpm 9 or newer through Corepack
- Postgres 16, Supabase, or another compatible Postgres database
- Upstash Redis REST credentials for production-like queues
- Privy app credentials
- Helius API key for devnet RPC and transaction enrichment
- Helius webhook ID if you want Mortem to manage the wallet watchlist automatically
- Ollama cloud API key (https://ollama.com/settings/keys) or an Anthropic API key for analysis
- Solana CLI if you want to fund a local memo signer wallet

## Environment Setup

This repo includes safe example files:

```text
.env.example
apps/dashboard/.env.example
apps/server/.env.example
apps/ingest/.env.example
apps/anchor-worker/.env.example
apps/enrichment-worker/.env.example
packages/db/.env.example
packages/sdk/.env.example
packages/shared/.env.example
```

Use the root example as a full-stack checklist:

```bash
cp .env.example .env.local
```

For Next.js apps, copy the app-level examples too:

```bash
cp apps/dashboard/.env.example apps/dashboard/.env.local
cp apps/server/.env.example apps/server/.env.local
```

For non-Next services, export variables in your shell or process manager before starting them:

```bash
set -a
source .env.local
set +a
```

Never commit `.env`, `.env.local`, private keys, API keys, webhook secrets, or wallet secret keys.

Important environment values to set for the current architecture:

- `MORTEM_SIGNER_SECRET_KEY` is the funded signer used by the memo anchoring worker.
- `HELIUS_WEBHOOK_ID` lets the server add and remove agent wallets from the existing Helius webhook.
- `OLLAMA_API_KEY` and `OLLAMA_MODEL` are required when `LLM_PROVIDER=ollama`.

## Install

```bash
corepack enable
corepack pnpm install
```

## Database Setup

Point `DATABASE_URL` at Postgres, then generate Prisma client code and apply migrations:

```bash
corepack pnpm --filter @mortemlabs/db db:generate
corepack pnpm --filter @mortemlabs/db db:migrate
```

To validate the Prisma schema:

```bash
corepack pnpm --filter @mortemlabs/db db:validate
```

## Run Locally

The most convenient path is to run the core services in separate terminals.

Start the API server:

```bash
corepack pnpm --filter @mortemlabs/server dev
```

Start the dashboard:

```bash
corepack pnpm --filter @mortemlabs/dashboard dev
```

Start ingest:

```bash
corepack pnpm --filter @mortemlabs/ingest dev
```

Optional workers:

```bash
corepack pnpm --filter @mortemlabs/server worker:analysis
corepack pnpm --filter @mortemlabs/anchor-worker dev
corepack pnpm --filter @mortemlabs/enrichment-worker dev
```

Default local URLs:

```text
Dashboard:         http://localhost:3000
tRPC server:       http://localhost:3001/api/trpc
Ingest service:    http://localhost:4001
Enrichment worker: http://localhost:4002
```

You can also start every package with Turbo:

```bash
corepack pnpm dev
```

That is useful once your shell has the shared environment loaded.

## Using The Dashboard

1. Open `http://localhost:3000`.
2. Sign in with Privy.
3. Click `Add agent` or open `/app/agents/new`.
4. Create an agent and copy the API key and verify token shown during onboarding. They are only shown once.
5. Add `MORTEM_API_KEY`, `MORTEM_AGENT_ID`, and the one-time `MORTEM_VERIFY_TOKEN` to your agent.
6. Run the agent once so the wizard can detect the first trace.
7. Open the agent detail page to watch live traces.
8. Open a trace detail page to inspect events, analysis, sharing, memo anchoring, and verification state.

## Using The SDK

Install the SDK package in an agent project, or import it from this workspace while developing.

Basic manual instrumentation:

```ts
import { Mortem } from "@mortemlabs/sdk"

const mortem = new Mortem({
  apiKey: process.env.MORTEM_API_KEY ?? "",
  agentId: process.env.MORTEM_AGENT_ID,
  verifyToken: process.env.MORTEM_VERIFY_TOKEN, // remove after the first successful connection
  environment: "devnet",
  ingestUrl: process.env.MORTEM_INGEST_URL ?? "http://localhost:4001",
})

const session = await mortem.startSession({
  inputSummary: "Answer a user question and optionally send a Solana transaction",
  tags: ["local-dev"],
})

try {
  const planning = session.beginEvent("custom", {
    step: "planning",
  })

  planning.complete({
    payload: {
      step: "planning",
      result: "ready",
    },
  })

  await session.complete("Agent completed successfully")
} catch (error) {
  await session.fail(error)
} finally {
  await mortem.close()
}
```

Provider wrappers:

```ts
const openai = mortem.wrapOpenAI(openaiClient)
const anthropic = mortem.wrapAnthropic(anthropicClient)
const ollama = mortem.wrapOllama(ollamaClient)
const tools = mortem.wrapTools(vercelAiTools)
const model = mortem.wrapLanguageModel(vercelAiModel)
const connection = mortem.wrapConnection(solanaConnection)
```

The SDK is designed to be best effort. Buffer flush errors are swallowed and reported through the
optional logger instead of interrupting the agent.

If you use the onboarding wizard, it pre-fills the exact `MORTEM_API_KEY`, `MORTEM_AGENT_ID`, and
`MORTEM_VERIFY_TOKEN` values for you and keeps polling until the first trace is received.

## Memo Anchoring

The anchoring flow has three parts:

1. The worker groups completed trace hashes by agent.
2. It computes a Merkle root and stores per-trace proofs in Postgres.
3. It submits one Solana memo transaction containing the batch metadata.

If you need a devnet signer wallet:

```bash
solana-keygen new --outfile mortem-signer.json
solana airdrop 1 <pubkey> --url devnet
```

Put the base58-encoded secret key in `MORTEM_SIGNER_SECRET_KEY`.

The worker writes the resulting memo transaction signature and slot back onto each trace together
with its Merkle proof, so public verification does not depend on any custom program state.

## Common Scripts

Root scripts:

```bash
corepack pnpm build
corepack pnpm lint
corepack pnpm test
corepack pnpm typecheck
corepack pnpm format
```

Package-specific examples:

```bash
corepack pnpm --filter @mortemlabs/shared test
corepack pnpm --filter @mortemlabs/sdk test
corepack pnpm --filter @mortemlabs/ingest test
corepack pnpm --filter @mortemlabs/dashboard build
corepack pnpm --filter @mortemlabs/server build
```

## Testing

The repo has unit and integration-style coverage across the main packages:

- shared hashing, canonical JSON, and Merkle utilities
- SDK buffering and instrumentation behavior
- ingest routes
- workers

Run everything:

```bash
corepack pnpm test
```

## Production Notes

- Use managed Postgres, such as Supabase Postgres 16.
- Use Upstash Redis REST credentials for queues, live events, and rate limits.
- Set all secrets in your deployment platform, not in committed files.
- Keep `NEXT_PUBLIC_*` values public-safe because they are exposed to browsers.
- Use Helius devnet RPC for the MVP unless you are intentionally moving to mainnet.
- Set `HELIUS_WEBHOOK_ID` if you want agent wallet creation and deletion to update the existing Helius webhook automatically.
- Keep `MORTEM_MASTER_KEY` stable if you encrypt SDK payloads. Losing it means encrypted payloads
  cannot be decrypted.
- Rotate agent API keys from the dashboard if a key leaks.
- Ollama costs are tracked as externally billed usage, so the dashboard shows "tracked by Ollama" instead of a USD estimate.
- The server verifies Privy JWTs with `verifyAuthToken` only.

## Troubleshooting

If the dashboard shows no private data:

```text
Check NEXT_PUBLIC_PRIVY_APP_ID in apps/dashboard/.env.local.
Check PRIVY_APP_ID and PRIVY_APP_SECRET in apps/server/.env.local.
Restart both Next.js apps after changing env files.
```

If ingest rejects SDK batches:

```text
Confirm the agent API key was copied from the dashboard.
Confirm the API key hash exists on the Agent record.
If this is the first run, confirm MORTEM_VERIFY_TOKEN was included once.
Check DATABASE_URL and Redis credentials.
Check the ingest health endpoint at /healthz.
```

If analysis never appears:

```text
Run the analysis worker.
Check analysis:pending in Redis.
For Ollama, make sure OLLAMA_API_KEY is set. Get one at https://ollama.com/settings/keys.
For Ollama billing, check https://ollama.com/settings/usage.
For Anthropic, make sure ANTHROPIC_API_KEY is set.
```

If anchoring does not happen:

```text
Run the anchor worker.
Confirm HELIUS_RPC_URL.
Confirm MORTEM_SIGNER_SECRET_KEY is funded and valid.
Confirm the memo signer wallet has enough lamports for transaction fees.
Check the stored anchorSignature on the trace and inspect the memo payload in Explorer.
```

## License

This repository is private while Mortem is under active development.
