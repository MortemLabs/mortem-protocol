# Mortem

Mortem is being built to help Solana trading bot teams catch bad decisions, reconstruct exactly
why they happened, and fix strategy code before the same loss repeats.

Today, this repository provides the foundation for that workflow: TypeScript agent instrumentation,
trace ingestion, live replay, post-trade analysis, and shareable autopsies. The long-term product
direction is real-time trade diagnosis and intervention; the current codebase is focused on
capturing the evidence chain and turning failed runs into actionable debugging context.

The project is a pnpm monorepo powered by Turborepo, strict TypeScript, Prisma, Fastify, Next.js,
Privy, Upstash Redis, and a preserved-but-decoupled anchor worker for future on-chain experiments.

## What Mortem Does

Mortem is designed to answer the questions bot operators actually care about after a bad trade:

- What did the agent decide, and in what order?
- What tool output, market context, or onchain state did it rely on?
- Which Solana transaction actually landed?
- Which 2-3 moments mattered between the signal and the loss?
- What should the operator change before the next run?

Right now, the repo is strongest at retrospective diagnosis:

- capture the full trace
- replay the chronology
- inspect the analysis
- generate a fix suggestion or next debugging step

The core flow is:

```text
TypeScript trading agent
  -> @mortemlabs/sdk
  -> ingest service
  -> Postgres traces and events
  -> dashboard, live replay, analysis worker, shared autopsy
```

## Repository Structure

```text
.
├── apps
│   ├── dashboard          Next.js dashboard and public share pages
│   ├── server             Next.js tRPC API, analysis worker, and Helius webhook helpers
│   ├── ingest             Fastify trace ingestion and live SSE service
│   ├── anchor-worker      Preserved but decoupled worker for future on-chain anchoring
│   └── enrichment-worker  Helius webhook worker for Solana transaction enrichment
├── packages
│   ├── shared             Shared types, Zod schemas, canonical JSON, hashing, and utilities
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
- market-context helpers for Jupiter quotes and Pyth prices
- gzip buffering with retries
- best-effort behavior so SDK failures do not crash the agent
- optional AES-256-GCM payload encryption with `MORTEM_MASTER_KEY`

### Ingest Service

`apps/ingest` is a Fastify service. It accepts trace batches from the SDK and turns them into the
stored evidence chain used by the dashboard and analysis worker.

Main routes:

```text
GET  /healthz
POST /v1/traces/batch
POST /v1/traces/:id/complete
GET  /v1/agents/:id/live
```

The batch route validates input with Zod, resolves API keys, rate limits by agent, writes traces
and events through Prisma, pushes live updates to Redis, and queues completed traces for analysis.

### API Server

`apps/server` is a Next.js app that exposes tRPC at:

```text
http://localhost:3001/api/trpc
```

Routers:

- `agents`: list, get, create, rotate API key, check onboarding connection state, delete
- `traces`: list, get, share, unshare, public by-share-token read, delete
- `analysis`: get and rerun trace analysis

Privy is frontend-only for login. The browser sends a Privy JWT with tRPC calls, and the server only
uses `verifyAuthToken` to verify that JWT.

When an agent is created with an `agentWallet`, the server also updates the configured Helius webhook
watchlist so that wallet enrichment stays in sync without hardcoding webhook settings.

### Dashboard

`apps/dashboard` is the user interface for agent onboarding, trace inspection, and shared autopsies.

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

Shared trace links remain available through `/share/[token]`, but the public page now shows only the
trace, events, and analysis. The older cryptographic verification block is no longer part of the
live product surface.

The product story in the UI is now narrower than generic "observability":

- show the decision sequence
- show the market or execution context around it
- identify what likely broke
- help the operator decide what to change next

The primary first-run path is `/app/agents/new`, a four-step onboarding wizard:

1. Create the agent and reveal the plaintext API key one time.
2. Install `@mortemlabs/sdk` with prefilled environment values, including the one-time
   `MORTEM_VERIFY_TOKEN`.
3. Copy a minimal integration snippet or an AI-assistant prompt with the real credentials.
4. Poll until the agent is both connected and verified. After verification, you can remove
   `MORTEM_VERIFY_TOKEN` from the agent env and code.

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
anchor:pending             UNUSED. reserved for future on-chain anchoring feature
analysis:pending           Trace IDs waiting for LLM analysis
analysis:ready:{traceId}   Analysis completion signal
ratelimit:{agentId}:{min}  Ingest rate limit counter
trace:{traceId}            Cached trace JSON
```

For local development, some services have in-memory Redis fallbacks when Upstash credentials are not
present. Postgres is still required for real app flows.

### Analysis Worker

The analysis worker lives in `apps/server/src/server/analysis-worker.ts`.

It polls `analysis:pending`, fetches trace context from Postgres, calls the configured LLM provider,
writes `TraceAnalysis`, and publishes `analysis:ready:{traceId}`.

Today, analysis is asynchronous and post-trade. It is best understood as autopsy and diagnosis, not
yet as full real-time intervention. The intended direction is to move closer to "catch the bad
decision before it repeats," while keeping every claim tied to inspectable evidence.

Provider selection is controlled by `LLM_PROVIDER`:

```text
LLM_PROVIDER=ollama
LLM_PROVIDER=anthropic
```

Ollama is the default and uses the hosted cloud API — no local installation needed. Set
`OLLAMA_API_KEY` and `OLLAMA_MODEL`. Anthropic requires `ANTHROPIC_API_KEY`.

### Anchor Worker

On-chain anchoring is preserved under `apps/anchor-worker` but not wired into the default product
flow. Status, env vars, how to run the worker, and troubleshooting are in
[apps/anchor-worker/README.md](apps/anchor-worker/README.md).

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

- `HELIUS_WEBHOOK_ID` lets the server add and remove agent wallets from the existing Helius webhook.
- `OLLAMA_API_KEY` and `OLLAMA_MODEL` are required when `LLM_PROVIDER=ollama`.
- `MORTEM_INGEST_URL=http://localhost:4001` should be set in local agent projects. The SDK
  default is `https://ingest.mortem.dev`, which is correct for hosted usage but not for local dev.

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

That starts the shared app pipeline and intentionally excludes `@mortemlabs/anchor-worker`.

## Using The Dashboard

1. Open `http://localhost:3000`.
2. Sign in with Privy.
3. Click `Add agent` or open `/app/agents/new`.
4. Create an agent and copy the API key and verify token shown during onboarding. They are only shown once.
5. Add `MORTEM_API_KEY`, `MORTEM_AGENT_ID`, `MORTEM_VERIFY_TOKEN`, and `MORTEM_INGEST_URL` to
   your agent.
6. Run the agent once so the wizard can detect the first trace and verify ownership.
7. After the wizard shows the agent as verified, remove `MORTEM_VERIFY_TOKEN` from the agent env
   and code.
8. Open the agent detail page to watch live traces.
9. Open a trace detail page to inspect the chronology, analysis, and suggested next fix.

## Using The SDK

Install the SDK package in an agent project, or import it from this workspace while developing.

Recommended local env:

```bash
MORTEM_API_KEY=...
MORTEM_AGENT_ID=...
MORTEM_VERIFY_TOKEN=... # remove after verification
MORTEM_INGEST_URL=http://localhost:4001
```

Recommended session pattern:

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
  inputSummary: "Evaluate a Solana trade setup and optionally submit the swap",
  tags: ["swap", "local-dev"],
})

try {
  const result = await session.run(async () => {
    const planning = session.beginEvent("custom", {
      step: "planning",
    })

    planning.complete({
      payload: {
        step: "planning",
        result: "ready",
      },
    })

    return { ok: true }
  })

  await session.complete("Agent completed successfully")
  console.log(session.traceId, result.ok)
} catch (error) {
  await session.fail(error)
} finally {
  await mortem.close()
}
```

Why `session.run(...)` matters:

- It keeps Mortem's async trace context active while your agent performs work.
- Without it, you can create a top-level trace but still miss child LLM, tool, or Solana events.

Common wrappers:

```ts
const openai = mortem.wrapOpenAI(openaiClient)
const anthropic = mortem.wrapAnthropic(anthropicClient)
const ollama = mortem.wrapOllama(ollamaClient)
const tools = mortem.wrapTools(vercelAiTools)
const model = mortem.wrapLanguageModel(vercelAiModel)
const connection = mortem.wrapConnection(solanaConnection)
```

Typical Vercel AI SDK integration:

```ts
const tracedTools = mortem.wrapTools(tools)
const tracedModel = mortem.wrapLanguageModel(model)

const session = await mortem.startSession({
  inputSummary: "Evaluate whether the bot should open a token position",
})

try {
  const result = await session.run(async () => {
    return generateText({
      model: tracedModel,
      tools: tracedTools,
      maxSteps: 5,
      prompt: "Should I swap 1 SOL for JUP right now?",
    })
  })

  await session.complete(result.text)
} catch (error) {
  await session.fail(error)
} finally {
  await mortem.close()
}
```

Important SDK notes:

- `verifyToken` is sent only once, on the first flush after init.
- `session.traceId` is an alias for `session.id`.
- The SDK does not create public share links. Build dashboard URLs yourself from the trace id if
  you want to print a local trace URL.
- The default ingest URL is `https://ingest.mortem.dev`. Override it in local development.

The SDK is designed to be best effort. Buffer flush errors are swallowed and reported through the
optional logger instead of interrupting the agent.

If you use the onboarding wizard, it pre-fills the exact `MORTEM_API_KEY`, `MORTEM_AGENT_ID`, and
`MORTEM_VERIFY_TOKEN` values for you and keeps polling until the first trace is received and the
agent is verified.

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
- Anchor worker: decoupled from the default pipeline; see [apps/anchor-worker/README.md](apps/anchor-worker/README.md).

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
Run the analysis worker in a separate terminal: corepack pnpm --filter @mortemlabs/server worker:analysis
Restart the worker after pulling changes to analysis logic.
Confirm the trace status is completed. Analysis does not run for traces still marked running.
Check analysis:pending in Redis.
For Ollama, make sure OLLAMA_API_KEY is set. Get one at https://ollama.com/settings/keys.
For Ollama billing, check https://ollama.com/settings/usage.
For Anthropic, make sure ANTHROPIC_API_KEY is set.
```

Anchor worker: [apps/anchor-worker/README.md](apps/anchor-worker/README.md).

## License

This repository is private while Mortem is under active development.
