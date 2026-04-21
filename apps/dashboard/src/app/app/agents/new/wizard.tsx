// The onboarding wizard guides users from agent creation to first trace receipt. Each step stays
// visible so the setup feels like one connected flow instead of four disconnected forms.
"use client"

import { trpc, useDashboardAuth } from "@/components/providers"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { usePrivy } from "@privy-io/react-auth"
import { AlertCircle, ArrowLeft, Check, CheckCircle2, Lock, Loader2 } from "lucide-react"
import Link from "next/link"
import type { ReactNode } from "react"
import { useMemo, useState } from "react"

type CreatedAgent = {
  apiKey: string
  displayName: string
  id: string
}

type StepNumber = 1 | 2 | 3 | 4
type StepState = "active" | "complete" | "future"

const previewAgent: CreatedAgent = {
  apiKey: "mtm_preview_01JAGENTKEY",
  displayName: "yield-hunter-v2",
  id: "01JAGENTPREVIEWNEW",
}

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
  const utils = trpc.useUtils()
  const [currentStep, setCurrentStep] = useState<StepNumber>(1)
  const [displayName, setDisplayName] = useState("yield-hunter-v2")
  const [createdAgent, setCreatedAgent] = useState<CreatedAgent | null>(
    mode === "preview" ? previewAgent : null,
  )
  const [localError, setLocalError] = useState<string | null>(null)

  const createAgent = trpc.agents.create.useMutation({
    onSuccess: async (result) => {
      setCreatedAgent({
        apiKey: result.apiKey,
        displayName: result.agent.displayName,
        id: result.agent.id,
      })
      setCurrentStep(2)
      setLocalError(null)
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
      return
    }

    setLocalError(null)
    await createAgent.mutateAsync({ displayName: trimmedName })
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
              <h1 className="mt-2 text-3xl font-semibold tracking-normal">Add a new agent</h1>
            </div>
            <p className="text-sm leading-6 text-muted-foreground">
              Create an API key, wire the SDK into your agent, and wait for the first trace to
              prove the connection.
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
              {...(createdAgent === null ? {} : { onEdit: () => setCurrentStep(1) })}
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
                    Your agent is already created. Continue below to install the SDK and connect
                    the first trace.
                  </div>
                  <SummaryGrid
                    rows={[
                      ["Agent name", createdAgent.displayName],
                      ["Agent ID", createdAgent.id],
                    ]}
                  />
                  <Button type="button" onClick={() => setCurrentStep(2)}>
                    Continue to install
                  </Button>
                </div>
              )}
            </WizardStep>

            <WizardStep
              description="Install the SDK after the agent exists so the real credentials are ready."
              number={2}
              state={stepTwoState}
              title="Install the SDK"
            >
              <LockedStepBody />
            </WizardStep>

            <WizardStep
              description="Add the wrapper once the SDK is installed."
              number={3}
              state={stepThreeState}
              title="Wrap your agent"
            >
              <LockedStepBody />
            </WizardStep>

            <WizardStep
              description="Run the agent once and Mortem will look for the first trace."
              number={4}
              state={stepFourState}
              title="Listening for your agent…"
            >
              <LockedStepBody />
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
