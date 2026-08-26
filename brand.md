# Brand — Mortem

> Case File № 003 · Brand Bible · Rev 1.0 · 2026-04-30
>
> Ship. Bury. Repeat.

This file is the source of truth for Mortem's color, typography, and voice. The `frontend-design-guidelines` skill reads it; the dashboard's `globals.css` and `layout.tsx` enforce it.

## 0 · Product Positioning

### One-liner

Mortem is forensic tooling for onchain trading agents: it turns bad trades into evidence-backed diagnoses and improvement loops.

### Short description

Mortem helps onchain trading agents improve from bad trades instead of just logging them.

It helps builders and operators understand why an autonomous agent made a bad trade by reconstructing the full decision timeline: what the agent saw, what tools returned, what changed in the market, what happened onchain, and where the decision broke.

The goal is to turn bad trades into evidence-backed diagnoses and improvement loops, so agents do not just execute faster, they get better after they are wrong.

### Problem solved

Autonomous trading agents are starting to control real capital, but when they make a bad trade, teams often cannot tell whether the failure came from stale market data, bad tool output, delayed execution, weak strategy logic, or missing guardrails.

Most systems treat a bad trade like an event to log. Mortem treats it like evidence to reconstruct, diagnose, and turn into a fix.

### How it works

Mortem instruments an agent and captures its decision timeline: LLM calls, tool calls, Solana transactions, custom events, and execution metadata.

It connects that trace with onchain activity and market context, then analyzes what went wrong. The product is designed to answer:

- What did the agent know when it acted?
- What tools or data shaped the decision?
- What changed before execution?
- What happened onchain?
- Was the failure avoidable?
- What should change before the agent trades again?

### Who it is for

Mortem is for builders and operators of onchain trading agents, especially teams running bots on Solana who need to catch bad decisions, diagnose the cause with evidence, and fix the agent before it repeats the same mistake with real capital.

### Why now

Onchain agents are moving from demos to real execution. As more capital flows through autonomous systems, the important problem shifts from "can agents trade?" to "can we understand, improve, and trust the agents that trade?"

Mortem is built for that next phase: agents that can act, explain, and improve after being wrong.

### Current repo context

This repo represents the current Mortem proof of concept, not the full end-state product.

It includes the core foundation: a TypeScript SDK for instrumenting agents, trace ingestion, storage, dashboard UI, Solana transaction capture, and LLM-based trace analysis. The current version focuses on recording and replaying an agent's decision timeline so users can understand what happened during a bad trade.

The broader product vision goes further: real-time analysis of autonomous trading agents, evidence-backed diagnosis using market and onchain context, and eventually code or strategy suggestions that help agents avoid repeating bad decisions.

Some pieces are still early or experimental. Postgres is used today for trace storage, but high-volume event data may move to ClickHouse later. Solana data ingestion may also evolve toward Anza Jetstreamer. The anchor worker and onchain anchoring pieces are present but not part of the main product flow yet.

### Technology

Mortem is built with TypeScript, Next.js, Redis, Prisma, Postgres, and a lightweight SDK for instrumenting agents.

On the crypto side, Mortem integrates with Solana, Helius, Jupiter, and Pyth to capture onchain activity, transaction context, routes, and market data. For analysis, Mortem uses LLMs to turn traces and evidence into diagnoses and suggested fixes.

As the system scales, high-volume trace and event storage may move to ClickHouse, with Anza Jetstreamer used for faster Solana data ingestion.

### External answers

**What are you building, and who is it for?**

We are building Mortem, a system for improving autonomous trading agents.

It helps teams understand why an agent made a bad trade by reconstructing the full decision timeline: what the agent saw, what tools returned, what changed in the market, what happened onchain, and where the strategy or code broke.

The first users are builders and operators of onchain trading agents, especially people running bots on Solana who need to catch bad decisions, diagnose the cause with evidence, and fix the agent before it repeats the same mistake with real capital.

**Why did you decide to build this, and why build it now?**

We decided to build Mortem because autonomous trading agents are starting to control real capital, but most teams still debug them like normal software: logs, dashboards, and guesswork after something goes wrong.

That is not enough when an agent can observe, reason, call tools, sign transactions, and act onchain. A bad trade is rarely just "the model was wrong." It can come from stale market context, a broken tool output, delayed execution, missing guardrails, or a strategy assumption that quietly failed.

The timing feels right because onchain agents are moving from demos to real execution. As more capital flows through them, the important problem shifts from "can agents trade?" to "can we understand, improve, and trust the agents that trade?" Mortem exists for that next phase.

## 1 · Voice

We don't hype. We file.

| Surface | Tagline |
|---|---|
| Primary | Ship. Bury. Repeat. |
| Product | *Every project gets a death certificate.* |
| Short | A SMALL GROUP. BURYING WHAT'S DEAD. |

**Do:** name the cause not the symptom; verbs of finality (*ship, bury, certify, file, autopsy*); coroner-calm.
**Don't:** emoji, exclamation points, "oops", hype.

| Bad | Good |
|---|---|
| Oops! Something went wrong | Something died. We're writing the autopsy. |
| Delete this run? | Bury this run? It won't come back. |
| Loading… | Measuring pulse… |
| Success! | Filed. |
| Error 500 | Cause of death: 500 |

## 2 · Color

Three colors. No more. Tokens in `apps/dashboard/src/app/globals.css`.

| Token | Hex | Role |
|---|---|---|
| `--ink` | `#0E0D0C` | Dominant background |
| `--paper` | `#EDEEE9` | Body text on ink, paper surfaces |
| `--signal` | `#DC2626` | Mark, accents, alarms, deceased state |

Supporting dark scale: `--ink-2` (card), `--ink-3` (raised), `--line` (divider), `--line-dim`, `--fg-faint`, `--fg-muted`.

**Ratio:** 60 ink · 30 paper · 10 signal.

**Forbidden:** blue, orange, second neutral, tinted reds, semantic green. A success toast just says it shipped — *Filed.*

## 3 · Typography

| Role | Family | Use |
|---|---|---|
| Display | Instrument Serif | Headlines, quotes, memorials. Italics carry tone shifts. |
| UI | Inter Tight | Body, buttons, navigation, forms. |
| Evidence | JetBrains Mono | Labels, code, case tags, timestamps. ALL CAPS · `.16em` letter-spacing. |

Loaded via `next/font/google` in [apps/dashboard/src/app/layout.tsx](apps/dashboard/src/app/layout.tsx). Headlines may end with a red period (`.stamp` utility): *Mortem.*

## 4 · The mark — M-Block

120u red square, two 16u paper legs inset 18u, 16u miter V apex y=62, 4u ink underline at y=108. Source: [apps/dashboard/src/components/mortem/mark.tsx](apps/dashboard/src/components/mortem/mark.tsx).

**Don't:** round corners, tilt, gradient the field, recolor outside palette, add shadow/glow/3D, thicken strokes.

## 5 · Layout

- 8px design grid; the M-Block uses a 12u construction grid — keep them separate.
- No border-radius. Anywhere. Except iOS app icon (20px) and avatars.
- Section padding: 40px desktop, 24px mobile. Card padding: 24–32px.
- Cards are bordered, square, on `--ink-2`. Use the `eyebrow`, `case-meta`, `stamp`, `tape`, and `death-stamp` utilities in `globals.css` instead of one-off classes.

## 6 · Motion

Clinical, not playful. 200–280ms, `cubic-bezier(.2, .8, .2, 1)`. ALIVE → DECEASED is a hard cut to red, never a fade. No bounce, no spring, no parallax.

---

**☩ Ship · Learn · Bury · Repeat ☩**
