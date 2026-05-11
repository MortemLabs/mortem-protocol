// The landing page sells Mortem as a loss-debugging workflow for Solana trading bots. It keeps
// the coroner voice, but the layout follows a focused developer-tool narrative instead of a broad
// observability pitch.
import { Mark } from "@/components/mortem/mark"
import { Button } from "@/components/ui/button"
import Link from "next/link"

const trustSignals = [
  "Built for Solana",
  "Traces agent payloads + onchain actions",
  "Jupiter & Pyth market data built-in",
]

const evidenceSteps = [
  {
    body: "Drop the Mortem SDK into your agent. One setup, zero overhead. Every decision your bot makes starts logging.",
    step: "01",
    title: "Instrument Once",
  },
  {
    body: "Mortem aligns your agent's payload, the onchain transaction, and live market data on a single timeline. You see exactly when the decision diverged from reality.",
    step: "02",
    title: "The Moment It Went Wrong",
  },
  {
    body: "Not a vague summary. A specific claim tied to timestamps, quotes, spreads, and the actual strategy path that fired.",
    step: "03",
    title: "The Diagnosis",
  },
  {
    body: "Mortem generates a targeted code-level fix prompt for the exact failure path. Review it, test it, ship it.",
    step: "04",
    title: "The Fix Prompt",
  },
]

const featureBlocks = [
  {
    body: "Mortem shows a clean, ordered timeline: agent payload first, then the market shift, then the bad execution. Not 200 events. The 3 that mattered.",
    eyebrow: "Chronological Trace View",
    problem: "You're staring at logs and guessing sequence.",
    visual: "Three timestamps. One failure chain. No dashboard sprawl.",
  },
  {
    body: "Every diagnosis is grounded in real-time Pyth price data and Jupiter liquidity quotes, not LLM assumptions. If the claim isn't supported by verifiable data, Mortem doesn't make it.",
    eyebrow: "Market Context Anchoring",
    problem: "You know the trade was bad, but you don't know what market condition caused it.",
    visual: "Price, spread, liquidity, and quote age pinned to the same moment.",
  },
  {
    body: "Mortem generates a specific, code-scoped fix prompt tied to the failing strategy path, not generic advice. You paste it into your codebase, review the diff, test it, ship it.",
    eyebrow: "Fix Prompts, Not Essays",
    problem: "You get a nice explanation with no clear action.",
    visual: "One failing branch. One remediation prompt. One next change.",
  },
  {
    body: "Native SDK for TypeScript agents on Solana. Trace LLM calls, tool invocations, wallet actions, and x402 payments in one unified agent timeline.",
    eyebrow: "Built for Agent Builders",
    problem: "Most observability tools were built for web apps, not autonomous trading logic.",
    visual: "Agent-native traces instead of generic app telemetry.",
  },
]

const faqs = [
  {
    answer:
      "No. You can replay past failed trades and run analysis on historical traces. Real-time alerting ships in the next version.",
    question: "Does my bot need to be live to use Mortem?",
  },
  {
    answer:
      "Currently Solana-native. Jupiter quotes and Pyth price feeds are built into the market context layer.",
    question: "What chains and protocols does Mortem support?",
  },
  {
    answer:
      "No. Deterministic checks run first for payload structure, market deviation, and execution timing. The LLM explains conclusions already anchored in verifiable facts.",
    question: "Is this just AI summarizing my logs?",
  },
  {
    answer:
      "TypeScript agent builders and Solana bot operators who run live trading strategies and need to debug and improve execution quality fast.",
    question: "Who is this built for?",
  },
  {
    answer:
      "It's a code-scoped instruction targeting the strategy path that failed, not a paragraph of suggestions. You review the proposed diff, run a backtest if needed, and ship only when you're confident.",
    question: "What does a fix prompt actually look like?",
  },
  {
    answer:
      "Yes. Traces are scoped to your wallet and agent. Nothing is shared or used for model training.",
    question: "Is my trade data private?",
  },
]

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="tape h-2 w-full" aria-hidden="true" />

      <div className="mx-auto max-w-7xl px-4 py-6 md:px-6 lg:px-8">
        <nav
          className="flex items-center justify-between border-b border-line pb-6"
          aria-label="Primary"
        >
          <Link
            href="/"
            className="inline-flex items-center gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Mark size={32} alt="Mortem" className="-pl-0.5 -mr-1.5" />
            <span className="font-display text-3xl leading-none">
              Mortem<span className="pl-0.5 text-[#DC2626] text-4xl">.</span>
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost">
              <Link href="/login">Sign in</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/app">Open dossier</Link>
            </Button>
          </div>
        </nav>

        <section className="flex min-h-[calc(100vh-7rem)] flex-col items-center justify-center py-16 text-center md:py-20">
          <p className="eyebrow">For Solana Trading Bots</p>
          <h1 className="mt-6 max-w-4xl font-display text-5xl leading-[0.92] tracking-tight md:text-7xl lg:text-[5.8rem]">
            Your bot made a bad trade<span className="text-[#DC2626]">.</span>
            <br />
            Find out exactly why<span className="text-[#DC2626]">.</span>
          </h1>
          <p className="mt-6 max-w-3xl text-base leading-7 text-muted-foreground md:text-xl md:leading-8">
            Mortem traces every agent decision against real market conditions, shows you the exact
            moment the strategy broke, and generates the code fix to prevent repeats.
          </p>

          <div className="mt-10 flex w-full max-w-md flex-col gap-3 sm:max-w-none sm:flex-row sm:justify-center">
            <Button asChild size="lg">
              <Link href="/app">Start Debugging</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/share/demo">View a Sample Autopsy</Link>
            </Button>
          </div>

          <div className="mt-14 w-full max-w-5xl border border-line bg-ink-2 text-left">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <span className="case-meta">Condensed replay</span>
              <span className="case-meta text-signal">3 moments that mattered</span>
            </div>

            <div className="grid gap-px bg-line lg:grid-cols-[1.1fr_0.95fr_0.95fr]">
              <TraceMoment
                detail="Bot receives a valid quote and fires the buy path."
                label="Agent decision"
                meta="T+00.000 · payload accepted"
              />
              <TraceMoment
                detail="Spread widens, liquidity shifts, and the route age exceeds the safe window."
                label="Market event"
                meta="T+02.184 · context diverges"
              />
              <TraceMoment
                detail="Execution lands on a worse entry than the strategy assumed."
                label="Bad outcome"
                meta="T+04.021 · loss realized"
              />
            </div>
          </div>
        </section>

        <section className="border-y border-line py-4">
          <div className="flex flex-col items-center justify-center gap-3 text-center md:flex-row md:gap-6">
            {trustSignals.map((signal) => (
              <div
                key={signal}
                className="border border-line bg-ink-2 px-4 py-3 text-sm text-muted-foreground"
              >
                {signal}
              </div>
            ))}
          </div>
        </section>

        <section className="my-12 border border-line bg-ink-2 px-6 py-12 text-center md:my-16 md:px-12 md:py-16">
          <p className="eyebrow">The problem</p>
          <h2 className="mt-4 font-display text-4xl leading-tight md:text-5xl">
            Your bot is live. It's losing money. And you have no idea why.
          </h2>
          <p className="mx-auto mt-6 max-w-3xl text-base leading-7 text-muted-foreground md:text-lg">
            Standard logs don't tell you if the entry was bad because volatility spiked, liquidity
            dried up, or the strategy signal was stale. You're flying blind between the decision
            and the loss.
          </p>
        </section>

        <section className="py-10 md:py-14">
          <div className="text-center">
            <p className="eyebrow">The Evidence Chain</p>
            <h2 className="mt-3 font-display text-4xl leading-tight md:text-5xl">
              Follow the failure from payload to patch.
            </h2>
          </div>

          <div className="mt-10 grid gap-4 lg:grid-cols-4">
            {evidenceSteps.map((item) => (
              <article key={item.step} className="border border-line bg-ink-2 p-5">
                <p className="case-meta text-signal">{item.step}</p>
                <h3 className="mt-4 font-display text-2xl leading-tight">{item.title}</h3>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">{item.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="py-10 md:py-14">
          <div className="space-y-6">
            {featureBlocks.map((block, index) => (
              <article
                key={block.eyebrow}
                className="grid gap-6 border border-line bg-ink-2 p-6 md:p-8 lg:grid-cols-2"
              >
                <div className={index % 2 === 0 ? "order-1" : "order-1 lg:order-2"}>
                  <FeatureVisual title={block.visual} variant={index} />
                </div>
                <div className={index % 2 === 0 ? "order-2" : "order-2 lg:order-1"}>
                  <p className="eyebrow">{block.eyebrow}</p>
                  <h3 className="mt-3 font-display text-3xl leading-tight">{block.problem}</h3>
                  <p className="mt-5 text-base leading-7 text-muted-foreground">{block.body}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        {/*<section className="py-10 md:py-14">
          <div className="text-center">
            <p className="eyebrow">What early users should say</p>
            <h2 className="mt-3 font-display text-4xl leading-tight md:text-5xl">
              Specific failure beats generic praise.
            </h2>
          </div>

          <div className="mt-10 grid gap-4 lg:grid-cols-3">
            {quotes.map((item) => (
              <figure key={item.quote} className="border border-line bg-ink-2 p-5">
                <blockquote className="font-display text-2xl leading-snug text-foreground">
                  “{item.quote}”
                </blockquote>
                <figcaption className="mt-5 text-sm text-muted-foreground">
                  {item.attribution}
                </figcaption>
              </figure>
            ))}
          </div>
        </section>*/}

        <section className="py-10 md:py-14">
          <div className="mx-auto max-w-4xl">
            <div className="text-center">
              <p className="eyebrow">FAQ</p>
              <h2 className="mt-3 font-display text-4xl leading-tight md:text-5xl">
                The questions technical buyers ask first.
              </h2>
            </div>

            <div className="mt-10 divide-y divide-line border border-line bg-ink-2">
              {faqs.map((faq) => (
                <details key={faq.question} className="group p-5">
                  <summary className="cursor-pointer list-none pr-6 text-left font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <span>{faq.question}</span>
                  </summary>
                  <p className="mt-4 max-w-3xl text-sm leading-6 text-muted-foreground">
                    {faq.answer}
                  </p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="border border-line bg-ink-2 px-6 py-12 text-center md:px-10 md:py-16">
          <p className="eyebrow">Final call</p>
          <h2 className="mt-3 font-display text-4xl leading-tight md:text-6xl">
            Stop debugging in the dark.
          </h2>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-muted-foreground md:text-lg">
            Bring your worst trade. We'll show you exactly what happened.
          </p>
          <div className="mt-8 flex justify-center">
            <Button asChild size="lg">
              <Link href="/app">Start a Free Autopsy</Link>
            </Button>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            No credit card. No lengthy setup. Just the SDK and your next bad trade.
          </p>
        </section>

        <footer className="border-t border-line py-6">
          <p className="case-meta text-center text-fg-muted">☩ Ship · Learn · Bury · Repeat ☩</p>
        </footer>
      </div>
    </main>
  )
}

function TraceMoment({
  detail,
  label,
  meta,
}: Readonly<{
  detail: string
  label: string
  meta: string
}>) {
  return (
    <article className="bg-ink-2 p-5">
      <p className="case-meta text-fg-muted">{meta}</p>
      <h2 className="mt-3 font-display text-3xl leading-tight text-signal">{label}</h2>
      <div className="mt-4 border-l-2 border-signal pl-4">
        <p className="text-sm leading-6 text-foreground">{detail}</p>
      </div>
    </article>
  )
}

function FeatureVisual({
  title,
  variant,
}: Readonly<{
  title: string
  variant: number
}>) {
  if (variant === 0) {
    return (
      <div className="border border-line bg-ink p-5">
        <div className="space-y-3">
          <VisualRow label="Payload" value="buy(signal=alpha_04)" />
          <VisualRow label="Market" value="spread widens · quote stale" />
          <VisualRow label="Execution" value="entry lands worse than model assumed" />
        </div>
        <p className="mt-5 text-sm text-muted-foreground">{title}</p>
      </div>
    )
  }

  if (variant === 1) {
    return (
      <div className="border border-line bg-ink p-5">
        <div className="grid gap-3 md:grid-cols-2">
          <MetricCard label="Pyth move" value="+2.8%" />
          <MetricCard label="Quote age" value="61.2s" />
          <MetricCard label="Liquidity" value="fell 34%" />
          <MetricCard label="Spread" value="widened 3.4x" />
        </div>
        <p className="mt-5 text-sm text-muted-foreground">{title}</p>
      </div>
    )
  }

  if (variant === 2) {
    return (
      <div className="border border-line bg-ink p-5">
        <div className="border border-line bg-ink-2 p-4 font-mono text-xs leading-6 text-muted-foreground">
          <p>// reject stale routes before execution</p>
          <p>if (routeAgeMs &gt; MAX_ROUTE_AGE_MS) return refreshQuote()</p>
          <p>// re-check spread before buy path</p>
          <p>if (spreadBps &gt; maxSpreadBps) return skipTrade()</p>
        </div>
        <p className="mt-5 text-sm text-muted-foreground">{title}</p>
      </div>
    )
  }

  return (
    <div className="border border-line bg-ink p-5">
      <div className="space-y-3">
        <VisualRow label="LLM call" value="intent classified" />
        <VisualRow label="Tool call" value="jupiter.quote + pyth.prices" />
        <VisualRow label="Wallet action" value="swap submitted" />
        <VisualRow label="Payment" value="x402 settled" />
      </div>
      <p className="mt-5 text-sm text-muted-foreground">{title}</p>
    </div>
  )
}

function VisualRow({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="flex items-center justify-between gap-3 border border-line bg-ink-2 px-4 py-3">
      <span className="case-meta">{label}</span>
      <span className="text-sm text-muted-foreground">{value}</span>
    </div>
  )
}

function MetricCard({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="border border-line bg-ink-2 p-4">
      <p className="eyebrow">{label}</p>
      <p className="mt-3 font-mono text-lg text-foreground">{value}</p>
    </div>
  )
}
