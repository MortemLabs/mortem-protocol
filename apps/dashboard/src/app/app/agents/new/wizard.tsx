// The onboarding wizard guides users from agent creation to first trace receipt. Each step stays
// visible so the setup feels like one connected flow instead of four disconnected forms.
"use client"

import { trpc, useDashboardAuth } from "@/components/providers"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { usePrivy } from "@privy-io/react-auth"
import {
  AlertCircle,
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronDown,
  Copy,
  Loader2,
  Lock,
  RefreshCcw,
} from "lucide-react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import type { ReactNode } from "react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

type CreatedAgent = {
  apiKey: string | null
  displayName: string
  id: string
  verifyToken: string | null
}

type IntegrationTab = "openai" | "anthropic" | "vercel" | "langchain"
type CodeLanguage = "bash" | "dotenv" | "text" | "typescript"
type StepNumber = 1 | 2 | 3 | 4
type StepState = "active" | "complete" | "future"

const previewAgent: CreatedAgent = {
  apiKey: "mtm_preview_01JAGENTKEY",
  displayName: "yield-hunter-v2",
  id: "01JAGENTPREVIEWNEW",
  verifyToken: "mrt_verify_a3f9c2d1",
}
const previewConnection = {
  connected: true,
  firstSeenAt: new Date("2026-04-21T09:30:00.000Z"),
  firstTraceId: "01JPREVIEWTRACE0001",
  verified: true,
}
const POLL_INTERVAL_MS = 4_000
const POLL_TIMEOUT_MS = 4 * 60 * 1_000
const ingestBatchUrl = `${
  process.env.NEXT_PUBLIC_MORTEM_INGEST_URL ?? "http://localhost:4001"
}/v1/traces/batch`
const integrationTabs: Array<{ label: string; value: IntegrationTab }> = [
  { label: "OpenAI", value: "openai" },
  { label: "Anthropic", value: "anthropic" },
  { label: "Vercel AI SDK", value: "vercel" },
  { label: "LangChain", value: "langchain" },
]

export function AgentOnboardingWizard() {
  const { privyEnabled } = useDashboardAuth()

  if (!privyEnabled) {
    return <WizardFrame mode="preview" />
  }

  return <AuthenticatedAgentOnboardingWizard />
}

function AuthenticatedAgentOnboardingWizard() {
  const { authenticated, login, ready } = usePrivy()

  if (!ready) {
    return <WizardMessage title="Loading onboarding…" description="Checking your Mortem session." />
  }

  if (!authenticated) {
    return (
      <WizardMessage
        title="Sign in to create an agent."
        description="Agent creation is protected by your Privy session because the API key is only shown once."
        actionLabel="Sign in"
        onAction={() => login()}
      />
    )
  }

  return <WizardFrame mode="private" />
}

function WizardFrame({ mode }: Readonly<{ mode: "preview" | "private" }>) {
  const searchParams = useSearchParams()
  const utils = trpc.useUtils()
  const resumeAgentId = mode === "private" ? searchParams.get("agentId") : null
  const [currentStep, setCurrentStep] = useState<StepNumber>(1)
  const [displayName, setDisplayName] = useState("yield-hunter-v2")
  const [activeIntegrationTab, setActiveIntegrationTab] = useState<IntegrationTab>("openai")
  const [isAssistantPromptOpen, setIsAssistantPromptOpen] = useState(false)
  const [createdAgent, setCreatedAgent] = useState<CreatedAgent | null>(
    mode === "preview" ? previewAgent : null,
  )
  const [localError, setLocalError] = useState<string | null>(null)
  const [timedOut, setTimedOut] = useState(false)
  const connectionPollRef = useRef<number | null>(null)
  const pollingStartedAtRef = useRef<number | null>(null)
  const resumeAgent = trpc.agents.get.useQuery(
    { id: resumeAgentId ?? "" },
    {
      enabled: mode === "private" && resumeAgentId !== null && createdAgent === null,
      retry: 1,
    },
  )
  const connectionCheck = trpc.agents.checkConnection.useQuery(
    { agentId: createdAgent?.id ?? previewAgent.id },
    {
      enabled: false,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  )

  const createAgent = trpc.agents.create.useMutation({
    onSuccess: async (result) => {
      setCreatedAgent({
        apiKey: result.apiKey,
        displayName: result.agent.displayName,
        id: result.agent.id,
        verifyToken: result.verifyToken,
      })
      setCurrentStep(2)
      setLocalError(null)
      setTimedOut(false)
      await utils.agents.list.invalidate()
    },
  })

  const trimmedName = displayName.trim()
  const nameError = useMemo(() => {
    if (trimmedName.length === 0) {
      return "Enter an agent name to continue."
    }

    if (/\s/u.test(trimmedName)) {
      return "Agent names cannot contain spaces."
    }

    return null
  }, [trimmedName])
  const stepOneState = resolveStepState(1, currentStep, createdAgent)
  const stepTwoState = resolveStepState(2, currentStep, createdAgent)
  const stepThreeState = resolveStepState(3, currentStep, createdAgent)
  const stepFourState = resolveStepState(4, currentStep, createdAgent)
  const hasVerifyCredentials =
    createdAgent !== null && createdAgent.apiKey !== null && createdAgent.verifyToken !== null
  const integrationExample =
    createdAgent === null || !hasVerifyCredentials
      ? null
      : getIntegrationExample(activeIntegrationTab)
  const assistantPrompt =
    createdAgent === null || !hasVerifyCredentials ? null : getAssistantPrompt(createdAgent)
  const connectionState = mode === "preview" ? previewConnection : connectionCheck.data
  const isConnected = connectionState?.connected === true
  const isVerified = connectionState?.verified === true
  const isWaitingForVerification = isConnected && !isVerified
  const createdAgentId = createdAgent?.id ?? null
  const refetchConnection = connectionCheck.refetch

  const stopConnectionPolling = useCallback(() => {
    if (connectionPollRef.current === null) {
      return
    }

    window.clearInterval(connectionPollRef.current)
    connectionPollRef.current = null
  }, [])

  const startConnectionPolling = useCallback(() => {
    if (mode !== "private" || createdAgentId === null || currentStep !== 4) {
      return
    }

    stopConnectionPolling()
    pollingStartedAtRef.current = Date.now()
    setTimedOut(false)
    void refetchConnection()
    connectionPollRef.current = window.setInterval(() => {
      if (
        pollingStartedAtRef.current !== null &&
        Date.now() - pollingStartedAtRef.current > POLL_TIMEOUT_MS
      ) {
        stopConnectionPolling()
        setTimedOut(true)
        return
      }

      void refetchConnection()
    }, POLL_INTERVAL_MS)
  }, [createdAgentId, currentStep, mode, refetchConnection, stopConnectionPolling])

  useEffect(() => {
    if (mode !== "private" || resumeAgentId === null || createdAgent !== null) {
      return
    }

    if (resumeAgent.data === undefined || resumeAgent.data === null) {
      return
    }

    setCreatedAgent({
      apiKey: null,
      displayName: resumeAgent.data.displayName,
      id: resumeAgent.data.id,
      verifyToken: null,
    })
    setCurrentStep(4)
    setLocalError(null)
    setTimedOut(false)
  }, [createdAgent, mode, resumeAgent.data, resumeAgentId])

  useEffect(() => {
    if (mode !== "private" || createdAgentId === null || currentStep !== 4) {
      stopConnectionPolling()
      return
    }

    if (isVerified || timedOut) {
      stopConnectionPolling()
      return
    }

    if (connectionPollRef.current === null) {
      startConnectionPolling()
    }

    return stopConnectionPolling
  }, [
    createdAgentId,
    currentStep,
    isVerified,
    mode,
    startConnectionPolling,
    stopConnectionPolling,
    timedOut,
  ])

  const submitStepOne = async () => {
    if (nameError !== null) {
      setLocalError(nameError)
      return
    }

    if (mode === "preview") {
      setCreatedAgent({
        ...previewAgent,
        displayName: trimmedName,
      })
      setCurrentStep(2)
      setLocalError(null)
      setTimedOut(false)
      return
    }

    setLocalError(null)
    await createAgent.mutateAsync({ displayName: trimmedName })
  }

  const refreshConnection = () => {
    if (mode !== "private" || createdAgent === null || currentStep !== 4) {
      return
    }

    startConnectionPolling()
  }

  if (mode === "private" && resumeAgentId !== null && createdAgent === null) {
    if (resumeAgent.isLoading) {
      return (
        <WizardMessage
          title="Loading agent setup…"
          description="Preparing the verification step for your existing agent."
        />
      )
    }

    if (resumeAgent.isError || resumeAgent.data === null) {
      return (
        <WizardMessage
          title="Agent did not load."
          description="The setup link may be stale or the agent may be outside your workspace."
        />
      )
    }
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-7xl px-4 py-6 md:px-6 lg:px-8">
        <Button asChild variant="ghost">
          <Link href="/app">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Agents
          </Link>
        </Button>

        <section className="mt-6 grid gap-10 lg:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="space-y-4">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Agent onboarding</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-normal">
                {resumeAgentId === null ? "Add a new agent" : "Finish agent setup"}
              </h1>
            </div>
            <p className="text-sm leading-6 text-muted-foreground">
              Create an API key, wire the SDK into your agent, and wait for the first trace plus the
              verify token proof to confirm the connection.
            </p>
            {mode === "preview" ? (
              <div className="rounded-md border border-amber-600/30 bg-amber-500/10 p-4 text-sm text-amber-800 dark:text-amber-200">
                Preview mode is enabled because Privy is not configured. The wizard uses sample
                credentials instead of creating a real agent.
              </div>
            ) : null}
          </aside>

          <div className="space-y-5">
            <WizardStep
              description="Used to identify this agent in your dashboard. No spaces."
              number={1}
              state={stepOneState}
              summary={
                createdAgent === null
                  ? null
                  : `${createdAgent.displayName} created · ${createdAgent.id}`
              }
              title="Name your agent"
            >
              {createdAgent === null ? (
                <div className="space-y-4">
                  <label className="block" htmlFor="agent-name">
                    <span className="text-sm font-medium text-foreground">Agent name</span>
                    <input
                      id="agent-name"
                      value={displayName}
                      onChange={(event) => setDisplayName(event.currentTarget.value)}
                      placeholder="yield-hunter-v2"
                      className="mt-2 h-11 w-full rounded-md border border-input bg-background px-3 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      autoComplete="off"
                      spellCheck={false}
                    />
                  </label>
                  <p className="text-sm text-muted-foreground">
                    Used to identify this agent in your dashboard. No spaces.
                  </p>
                  {localError === null && createAgent.error === null ? null : (
                    <p className="text-sm text-destructive">
                      {localError ?? createAgent.error?.message ?? "Could not create the agent."}
                    </p>
                  )}
                  <Button
                    type="button"
                    onClick={() => void submitStepOne()}
                    disabled={createAgent.isPending}
                  >
                    {createAgent.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <Check className="h-4 w-4" aria-hidden="true" />
                    )}
                    Create agent
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="rounded-md border border-emerald-600/30 bg-emerald-500/10 p-4 text-sm text-emerald-900 dark:text-emerald-100">
                    {hasVerifyCredentials
                      ? "Your agent is already created. Continue below to install the SDK and connect the first trace."
                      : "This agent is already created. Continue below to finish verification."}
                  </div>
                  <SummaryGrid
                    rows={[
                      ["Agent name", createdAgent.displayName],
                      ["Agent ID", createdAgent.id],
                    ]}
                  />
                  <Button
                    type="button"
                    onClick={() => setCurrentStep(hasVerifyCredentials ? 2 : 4)}
                  >
                    {hasVerifyCredentials ? "Continue to install" : "Continue to verification"}
                  </Button>
                </div>
              )}
            </WizardStep>

            <WizardStep
              description="Install the SDK after the agent exists so the real credentials are ready."
              number={2}
              state={stepTwoState}
              summary={
                createdAgent === null
                  ? null
                  : hasVerifyCredentials
                    ? "SDK install command and Mortem credentials are ready."
                    : "Credentials were shown once when this agent was created."
              }
              title="Install the SDK"
              {...(currentStep > 2 && hasVerifyCredentials
                ? { onEdit: () => setCurrentStep(2) }
                : {})}
            >
              {createdAgent === null ? (
                <LockedStepBody />
              ) : (
                <div className="space-y-5">
                  <CopyBlock
                    label="Install command"
                    language="bash"
                    value={"npm install @mortemlabs/sdk\n# or\npnpm add @mortemlabs/sdk"}
                  />
                  <CopyBlock
                    label="Environment variables"
                    language="dotenv"
                    value={`MORTEM_API_KEY=${createdAgent.apiKey ?? "<shown-once>"}\nMORTEM_AGENT_ID=${createdAgent.id}\nMORTEM_VERIFY_TOKEN=${createdAgent.verifyToken ?? "<shown-once>"}`}
                  />
                  {hasVerifyCredentials ? null : (
                    <div className="rounded-md border border-amber-600/30 bg-amber-500/10 p-4 text-sm text-amber-900 dark:text-amber-100">
                      The API key and verify token are only shown when the agent is first created.
                      If you already added them, continue to the verification step below.
                    </div>
                  )}
                  <Button
                    type="button"
                    onClick={() => setCurrentStep(hasVerifyCredentials ? 3 : 4)}
                  >
                    {hasVerifyCredentials ? "I've added this" : "Continue to verification"}
                  </Button>
                </div>
              )}
            </WizardStep>

            <WizardStep
              description="Add the wrapper once the SDK is installed."
              number={3}
              state={stepThreeState}
              summary={
                createdAgent === null
                  ? null
                  : hasVerifyCredentials
                    ? "Code snippets and the AI assistant prompt are ready to paste."
                    : "Your agent only needs to finish the verification check now."
              }
              title="Wrap your agent"
              {...(currentStep > 3 && hasVerifyCredentials
                ? { onEdit: () => setCurrentStep(3) }
                : {})}
            >
              {createdAgent === null ? (
                <LockedStepBody />
              ) : integrationExample === null || assistantPrompt === null ? (
                <div className="rounded-md border border-amber-600/30 bg-amber-500/10 p-4 text-sm text-amber-900 dark:text-amber-100">
                  This agent is already past the install step. If the SDK is in place, continue to
                  the verification check below.
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="space-y-3">
                    <div>
                      <h3 className="text-base font-semibold text-foreground">
                        Add one line to your agent
                      </h3>
                      <p className="mt-1 text-sm leading-6 text-muted-foreground">
                        Pick the SDK you already use. Mortem wraps the client without changing the
                        rest of your agent flow.
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {integrationTabs.map((tab) => (
                        <button
                          key={tab.value}
                          type="button"
                          onClick={() => setActiveIntegrationTab(tab.value)}
                          className={cn(
                            "rounded-md border px-3 py-2 text-sm font-medium transition",
                            activeIntegrationTab === tab.value
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border bg-background text-muted-foreground hover:border-primary/30 hover:text-foreground",
                          )}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>
                    <CodeBlock
                      label={integrationExample.label}
                      language="typescript"
                      value={integrationExample.code}
                    />
                    <div className="rounded-md border border-amber-600/30 bg-amber-500/10 p-4 text-sm text-black dark:text-black">
                      The verify token proves you control this agent. You can remove it from your
                      code after Mortem confirms the connection.
                    </div>
                  </div>

                  <CopyBlock
                    label="Wrap your Solana connection"
                    value={
                      "const connection = mortem.wrapConnection(\n  new Connection(process.env.RPC_URL!)\n)"
                    }
                    language="typescript"
                  />

                  <div className="rounded-md border border-border bg-background">
                    <button
                      type="button"
                      onClick={() => setIsAssistantPromptOpen((current) => !current)}
                      className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left"
                    >
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          Using an AI coding assistant?
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Copy a ready-to-paste prompt for Claude Code or Codex.
                        </p>
                      </div>
                      <span className="inline-flex items-center gap-2 text-sm font-medium text-foreground">
                        Copy this prompt for Claude Code or Codex
                        <ChevronDown
                          className={cn(
                            "h-4 w-4 transition",
                            isAssistantPromptOpen && "rotate-180",
                          )}
                          aria-hidden="true"
                        />
                      </span>
                    </button>

                    {isAssistantPromptOpen ? (
                      <div className="border-t border-border px-4 py-4">
                        <CopyBlock
                          label="AI assistant prompt"
                          value={assistantPrompt}
                          copyLabel="Copy AI prompt"
                          language="text"
                        />
                      </div>
                    ) : null}
                  </div>

                  <Button type="button" onClick={() => setCurrentStep(4)}>
                    I&apos;ve added this
                  </Button>
                </div>
              )}
            </WizardStep>

            <WizardStep
              description="Run the agent once and Mortem will wait for both the first trace and the verify token proof."
              number={4}
              state={stepFourState}
              title="Listening for your agent…"
            >
              {createdAgent === null || currentStep < 4 ? (
                <LockedStepBody />
              ) : (
                <div className="space-y-5">
                  <div className="flex items-start gap-3 rounded-md border border-border bg-background p-4">
                    {isVerified ? (
                      <CheckCircle2
                        className="mt-0.5 h-5 w-5 text-emerald-600"
                        aria-hidden="true"
                      />
                    ) : timedOut ? (
                      <span
                        className="mt-1 h-3 w-3 rounded-full bg-muted-foreground"
                        aria-hidden="true"
                      />
                    ) : isWaitingForVerification ? (
                      <span
                        className="mt-1 h-3 w-3 animate-pulse rounded-full bg-amber-500"
                        aria-hidden="true"
                      />
                    ) : (
                      <span
                        className="mt-1 h-3 w-3 animate-pulse rounded-full bg-primary"
                        aria-hidden="true"
                      />
                    )}

                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {isVerified
                          ? "Agent verified and connected."
                          : timedOut
                            ? isConnected
                              ? "Verification did not complete after 4 minutes."
                              : "No connection detected after 4 minutes."
                            : isWaitingForVerification
                              ? "Agent reached Mortem - waiting for verify token..."
                              : "Waiting for first trace"}
                      </p>
                      <p className="mt-1 text-sm leading-6 text-muted-foreground">
                        {isVerified
                          ? "Mortem matched the verify token and the connection is now trusted."
                          : timedOut
                            ? "Use the checklist below, then retry the polling step when you are ready."
                            : isWaitingForVerification
                              ? "Make sure MORTEM_VERIFY_TOKEN is set in your env and run your agent again."
                              : "Run your agent once so Mortem can receive a trace and verify the token."}
                      </p>
                    </div>
                  </div>

                  {connectionCheck.error === null || mode === "preview" ? null : (
                    <div className="rounded-md border border-amber-600/30 bg-amber-500/10 p-4 text-sm text-amber-900 dark:text-amber-100">
                      The dashboard could not check the connection just now. Try another refresh in
                      a moment.
                    </div>
                  )}

                  {isVerified ? (
                    <div className="rounded-md border border-emerald-600/30 bg-emerald-500/10 p-4">
                      <p className="text-sm font-medium text-emerald-900 dark:text-emerald-100">
                        Agent verified and connected.
                      </p>
                      {connectionState?.firstSeenAt === null ||
                      connectionState?.firstSeenAt === undefined ? null : (
                        <p className="mt-2 text-sm text-emerald-800 dark:text-emerald-200">
                          First seen {formatDateTime(connectionState.firstSeenAt)}.
                        </p>
                      )}
                      <p className="mt-2 text-sm text-emerald-800 dark:text-emerald-200">
                        You can remove <code>MORTEM_VERIFY_TOKEN</code> from your code now.
                      </p>
                      <div className="mt-4 flex flex-wrap gap-3">
                        {connectionState?.firstTraceId === null ||
                        connectionState?.firstTraceId === undefined ? null : (
                          <Button asChild>
                            <Link href={`/app/traces/${connectionState.firstTraceId}`}>
                              View first trace -&gt;
                            </Link>
                          </Button>
                        )}
                        <Button asChild variant="outline">
                          <Link href={`/app/agents/${createdAgent.id}`}>Go to dashboard -&gt;</Link>
                        </Button>
                      </div>
                    </div>
                  ) : timedOut ? (
                    <div className="rounded-md border border-border bg-muted/20 p-4">
                      <p className="text-sm font-medium text-foreground">
                        Troubleshooting checklist
                      </p>
                      <div className="mt-3 space-y-2 text-sm text-muted-foreground">
                        <p>
                          □ Is <code>MORTEM_API_KEY</code> correct?
                        </p>
                        <p>
                          □ Is <code>MORTEM_VERIFY_TOKEN</code> set in your env?
                        </p>
                        <p>
                          □ Did your agent actually run and make at least one LLM call or tool call?
                        </p>
                        <p>
                          □ Is your agent posting to the right endpoint?{" "}
                          <code>{ingestBatchUrl}</code>
                        </p>
                      </div>
                      <div className="mt-4 flex flex-wrap gap-3">
                        <Button type="button" variant="secondary" onClick={refreshConnection}>
                          <RefreshCcw className="h-4 w-4" aria-hidden="true" />
                          Try again
                        </Button>
                        <Button asChild variant="outline">
                          <Link href={`/app/agents/${createdAgent.id}`}>Skip for now</Link>
                        </Button>
                      </div>
                    </div>
                  ) : isWaitingForVerification ? (
                    <div className="rounded-md border border-amber-600/30 bg-amber-500/10 p-4">
                      <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
                        Agent reached Mortem - waiting for verify token...
                      </p>
                      {connectionState?.firstSeenAt === null ||
                      connectionState?.firstSeenAt === undefined ? null : (
                        <p className="mt-2 text-sm text-amber-800 dark:text-amber-200">
                          First trace received {formatDateTime(connectionState.firstSeenAt)}.
                        </p>
                      )}
                      <p className="mt-2 text-sm text-amber-800 dark:text-amber-200">
                        Make sure <code>MORTEM_VERIFY_TOKEN</code> is set in your env and run your
                        agent again.
                      </p>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center gap-3">
                      <Button type="button" variant="secondary" onClick={refreshConnection}>
                        <RefreshCcw
                          className={cn("h-4 w-4", connectionCheck.isFetching && "animate-spin")}
                          aria-hidden="true"
                        />
                        Refresh
                      </Button>
                      <p className="text-sm text-muted-foreground">
                        Mortem checks every 4 seconds for up to 4 minutes while this step stays
                        open.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </WizardStep>
          </div>
        </section>
      </div>
    </main>
  )
}

function WizardStep({
  children,
  description,
  number,
  onEdit,
  state,
  summary,
  title,
}: Readonly<{
  children: ReactNode
  description: string
  number: StepNumber
  onEdit?: () => void
  state: StepState
  summary?: string | null
  title: string
}>) {
  return (
    <section className="grid gap-4 md:grid-cols-[56px_minmax(0,1fr)]">
      <div className="relative flex justify-center">
        <div className="absolute top-12 bottom-[-1.25rem] w-px bg-border last:hidden" />
        <div
          className={cn(
            "relative z-10 flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold",
            state === "complete" &&
              "bg-emerald-600 text-white shadow-[0_0_0_4px_hsl(var(--background))]",
            state === "active" &&
              "border-2 border-primary bg-background text-primary shadow-[0_0_0_4px_hsl(var(--background))]",
            state === "future" &&
              "border border-border bg-muted text-muted-foreground shadow-[0_0_0_4px_hsl(var(--background))]",
          )}
        >
          {state === "complete" ? <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> : number}
        </div>
      </div>

      <div
        className={cn(
          "rounded-md border p-5",
          state === "active" && "border-primary/30 bg-card shadow-sm",
          state === "complete" && "border-border bg-card shadow-sm",
          state === "future" && "border-border bg-muted/20 text-muted-foreground",
        )}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-normal text-muted-foreground">
              Step {number}
            </p>
            <h2 className="mt-2 text-xl font-semibold tracking-normal">{title}</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
          </div>

          {state === "complete" && onEdit !== undefined ? (
            <Button type="button" variant="ghost" size="sm" onClick={onEdit}>
              Edit
            </Button>
          ) : state === "future" ? (
            <span className="inline-flex min-h-10 items-center gap-2 text-sm text-muted-foreground">
              <Lock className="h-4 w-4" aria-hidden="true" />
              Locked
            </span>
          ) : null}
        </div>

        {state === "complete" ? (
          <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden="true" />
            <span>{summary}</span>
          </div>
        ) : (
          <div className="mt-5">{children}</div>
        )}
      </div>
    </section>
  )
}

function LockedStepBody() {
  return (
    <div className="flex items-center gap-3 rounded-md border border-dashed border-border bg-background/70 p-4 text-sm text-muted-foreground">
      <Lock className="h-4 w-4" aria-hidden="true" />
      Complete the previous step to unlock this section.
    </div>
  )
}

function CodeBlock({
  label,
  language = "text",
  value,
}: Readonly<{ label: string; language?: CodeLanguage; value: string }>) {
  return (
    <div className="overflow-hidden rounded-lg border border-zinc-800/80 bg-zinc-900 shadow-[0_18px_40px_rgba(24,24,27,0.16)]">
      <div className="border-b border-zinc-800/80 bg-zinc-900/95 px-4 py-3">
        <p className="text-sm font-medium text-zinc-200">{label}</p>
      </div>
      <pre className="overflow-x-auto bg-zinc-900 px-4 py-4 text-sm leading-7 text-zinc-100">
        <code>{renderHighlightedCode(value, language)}</code>
      </pre>
    </div>
  )
}

function CopyBlock({
  copyLabel = "Copy",
  label,
  language = "text",
  value,
}: Readonly<{ copyLabel?: string; label: string; language?: CodeLanguage; value: string }>) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="overflow-hidden rounded-lg border border-zinc-800/80 bg-zinc-900 shadow-[0_18px_40px_rgba(24,24,27,0.16)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800/80 bg-zinc-900/95 px-4 py-3">
        <p className="text-sm font-medium text-zinc-200">{label}</p>
        <Button
          type="button"
          variant={copied ? "secondary" : "outline"}
          size="sm"
          onClick={() => void copy()}
          className={cn(
            "border-zinc-700 bg-zinc-800 text-zinc-200 hover:bg-zinc-700 hover:text-zinc-50",
            copied &&
              "border-emerald-500/25 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/15",
          )}
        >
          {copied ? (
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
          ) : (
            <Copy className="h-4 w-4" aria-hidden="true" />
          )}
          {copied ? "Copied" : copyLabel}
        </Button>
      </div>
      <pre className="overflow-x-auto bg-zinc-900 px-4 py-4 text-sm leading-7 text-zinc-100">
        <code>{renderHighlightedCode(value, language)}</code>
      </pre>
    </div>
  )
}

function SummaryGrid({ rows }: Readonly<{ rows: Array<[string, string]> }>) {
  return (
    <div className="grid gap-3 rounded-md border border-border bg-background p-4">
      {rows.map(([label, value]) => (
        <div key={label}>
          <p className="text-xs font-medium uppercase tracking-normal text-muted-foreground">
            {label}
          </p>
          <p className="mt-1 break-all font-mono text-xs text-foreground">{value}</p>
        </div>
      ))}
    </div>
  )
}

function WizardMessage({
  actionLabel,
  description,
  onAction,
  title,
}: Readonly<{
  actionLabel?: string
  description: string
  onAction?: () => void
  title: string
}>) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-8 text-foreground">
      <section className="w-full max-w-md rounded-md border border-border bg-card p-6 text-card-foreground shadow-sm">
        <AlertCircle className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
        <h1 className="mt-4 text-xl font-semibold tracking-normal">{title}</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          {actionLabel === undefined || onAction === undefined ? null : (
            <Button type="button" onClick={onAction}>
              {actionLabel}
            </Button>
          )}
          <Button asChild variant="secondary">
            <Link href="/app">Back to agents</Link>
          </Button>
        </div>
      </section>
    </main>
  )
}

function resolveStepState(
  step: StepNumber,
  currentStep: StepNumber,
  createdAgent: CreatedAgent | null,
): StepState {
  if (step === 1) {
    return createdAgent !== null && currentStep !== 1 ? "complete" : "active"
  }

  if (createdAgent === null) {
    return "future"
  }

  if (currentStep === step) {
    return "active"
  }

  return currentStep > step ? "complete" : "future"
}

function formatDateTime(value: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value)
}

function renderHighlightedCode(value: string, language: CodeLanguage): ReactNode[] {
  const tokens = getHighlightPattern(language)
  const parts: ReactNode[] = []
  let cursor = 0

  for (const match of value.matchAll(tokens.pattern)) {
    const index = match.index ?? 0
    const token = match[0]

    if (index > cursor) {
      parts.push(value.slice(cursor, index))
    }

    parts.push(
      <span key={`${language}-${index}`} className={tokens.className(token)}>
        {token}
      </span>,
    )
    cursor = index + token.length
  }

  if (cursor < value.length) {
    parts.push(value.slice(cursor))
  }

  return parts
}

function getHighlightPattern(language: CodeLanguage): Readonly<{
  className: (token: string) => string
  pattern: RegExp
}> {
  switch (language) {
    case "bash":
      return {
        pattern:
          /(#[^\n]*|\b(?:npm|pnpm|npx|corepack|node|bun)\b|@[a-z0-9-]+(?:\/[a-z0-9-]+)?|\b[a-z-]+(?==)|"(?:\\.|[^"])*"|'(?:\\.|[^'])*')/gim,
        className: (token) => {
          if (token.startsWith("#")) {
            return "text-muted-foreground"
          }

          if (token.startsWith("@")) {
            return "text-sky-300"
          }

          if (token.startsWith('"') || token.startsWith("'")) {
            return "text-emerald-300"
          }

          return "text-amber-200"
        },
      }
    case "dotenv":
      return {
        pattern: /(#[^\n]*|^[A-Z0-9_]+(?==)|"(?:\\.|[^"])*"|'(?:\\.|[^'])*'|<[^>\n]+>)/gim,
        className: (token) => {
          if (token.startsWith("#")) {
            return "text-muted-foreground"
          }

          if (token.startsWith('"') || token.startsWith("'") || token.startsWith("<")) {
            return "text-emerald-300"
          }

          return "text-sky-300"
        },
      }
    case "typescript":
      return {
        pattern:
          /(\/\/[^\n]*|"(?:\\.|[^"])*"|'(?:\\.|[^'])*'|`(?:\\.|[^`])*`|\b(?:import|from|const|new|return|if|else|await|async|type|interface)\b|\b(?:true|false|null|undefined)\b|process\.env\.[A-Z0-9_]+|\b(?:Mortem|OpenAI|Anthropic|Connection|ChatOpenAI)\b)/g,
        className: (token) => {
          if (token.startsWith("//")) {
            return "text-muted-foreground"
          }

          if (token.startsWith('"') || token.startsWith("'") || token.startsWith("`")) {
            return "text-emerald-300"
          }

          if (token.startsWith("process.env.")) {
            return "text-sky-300"
          }

          if (/^(Mortem|OpenAI|Anthropic|Connection|ChatOpenAI)$/.test(token)) {
            return "text-violet-200"
          }

          if (/^(true|false|null|undefined)$/.test(token)) {
            return "text-orange-200"
          }

          return "text-amber-200"
        },
      }
    case "text":
      return {
        pattern:
          /(`[^`\n]+`|"(?:\\.|[^"])*"|'(?:\\.|[^'])*'|^[A-Z0-9_]+(?==)|\b(?:npm install|pnpm add|Mortem|OpenAI|Anthropic|Vercel AI SDK|LangChain)\b)/gim,
        className: (token) => {
          if (token.startsWith("`")) {
            return "text-sky-300"
          }

          if (token.startsWith('"') || token.startsWith("'")) {
            return "text-emerald-300"
          }

          if (/^[A-Z0-9_]+$/.test(token)) {
            return "text-sky-300"
          }

          return "text-amber-200"
        },
      }
  }
}

function getIntegrationExample(tab: IntegrationTab): Readonly<{ code: string; label: string }> {
  const baseConfig = `import { Mortem } from "@mortemlabs/sdk"\n\nconst mortem = new Mortem({\n  apiKey: process.env.MORTEM_API_KEY!,\n  agentId: process.env.MORTEM_AGENT_ID!,\n  verifyToken: process.env.MORTEM_VERIFY_TOKEN, // remove after verified\n})`

  switch (tab) {
    case "openai":
      return {
        label: "OpenAI",
        code: `${baseConfig}\nimport OpenAI from "openai"\n\n// Wrap your existing OpenAI client\nconst openai = mortem.wrapOpenAI(new OpenAI())\n\n// Then use openai exactly as before\n// Every call is now traced automatically`,
      }
    case "anthropic":
      return {
        label: "Anthropic",
        code: `${baseConfig}\nimport Anthropic from "@anthropic-ai/sdk"\n\n// Wrap your existing Anthropic client\nconst anthropic = mortem.wrapAnthropic(new Anthropic())\n\n// Then use anthropic exactly as before\n// Every call is now traced automatically`,
      }
    case "vercel":
      return {
        label: "Vercel AI SDK",
        code: `${baseConfig}\nimport { tools } from "./tools"\n\n// Wrap your existing AI SDK tools\nconst tracedTools = mortem.wrapTools(tools)\n\n// Use tracedTools exactly as before in generateText or streamText`,
      }
    case "langchain":
      return {
        label: "LangChain",
        code: `${baseConfig}\nimport { ChatOpenAI } from "@langchain/openai"\n\nconst model = new ChatOpenAI({ model: "gpt-4.1-mini" }).withConfig({\n  callbacks: [mortem.langchainHandler()],\n})\n\n// Then use model exactly as before`,
      }
  }
}

function getAssistantPrompt(createdAgent: CreatedAgent): string {
  const apiKey = createdAgent.apiKey ?? "<shown-once>"
  const verifyToken = createdAgent.verifyToken ?? "<shown-once>"

  return `Add Mortem observability to this agent.

Install: npm install @mortemlabs/sdk

Use these env vars:
MORTEM_API_KEY="${apiKey}"
MORTEM_AGENT_ID="${createdAgent.id}"
MORTEM_VERIFY_TOKEN="${verifyToken}"

Add to your agent's entry point:

import { Mortem } from "@mortemlabs/sdk"
const mortem = new Mortem({
  apiKey: process.env.MORTEM_API_KEY!,
  agentId: process.env.MORTEM_AGENT_ID!,
  verifyToken: process.env.MORTEM_VERIFY_TOKEN,
})

Then:
- If you use OpenAI: wrap the client with mortem.wrapOpenAI(client)
- If you use Anthropic: mortem.wrapAnthropic(client)
- If you use Vercel AI SDK tools: mortem.wrapTools(tools)
- If you use LangChain: add mortem.langchainHandler() to your model's callbacks
- If you send Solana transactions: wrap the Connection with mortem.wrapConnection(connection)

Do not change any other agent logic. The wrapper intercepts calls transparently.
Keep MORTEM_VERIFY_TOKEN in place until Mortem confirms verification, then remove it.`
}
