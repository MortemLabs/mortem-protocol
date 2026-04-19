// The on-chain panel coordinates Phantom signing with server-built unsigned transactions.
// It renders the full PDA funding path and refreshes balances without exposing private keys.
"use client"

import { PdaQrCode } from "@/components/PdaQrCode"
import { trpc, useDashboardAuth } from "@/components/providers"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { usePrivy } from "@privy-io/react-auth"
import { Connection, Transaction } from "@solana/web3.js"
import type { inferRouterOutputs } from "@trpc/server"
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  Loader2,
  QrCode,
  RefreshCcw,
  ShieldCheck,
} from "lucide-react"
import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import type { AppRouter } from "../../../../../server/src/server/root"

type AgentListItem = inferRouterOutputs<AppRouter>["agents"]["list"][number]
type AnchorHistoryItem = inferRouterOutputs<AppRouter>["onchain"]["getAnchorHistory"][number]
type PdaInfo = inferRouterOutputs<AppRouter>["onchain"]["getUserPdaInfo"]

type PhantomProvider = {
  connect: () => Promise<{ publicKey: { toString: () => string } }>
  isPhantom?: boolean
  publicKey?: { toString: () => string }
  signAndSendTransaction?: (transaction: Transaction) => Promise<{ signature: string }>
  signTransaction?: (transaction: Transaction) => Promise<Transaction>
}

const DEVNET_RPC_URL = "https://api.devnet.solana.com"
const LAMPORTS_PER_SOL = 1_000_000_000
const LOW_BALANCE_LAMPORTS = 1_000_000
const PREVIEW_QR =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p94AAAAASUVORK5CYII="

const previewPdaInfo: PdaInfo = {
  balance: 7_500_000,
  funded: true,
  pdaAddress: "6WmMZKkR3T3Zd2QEqQeU2w3Z7u1N7dt5Sc9m6vbPda1",
  qr: {
    pdaAddress: "6WmMZKkR3T3Zd2QEqQeU2w3Z7u1N7dt5Sc9m6vbPda1",
    qrCodeDataUrl: PREVIEW_QR,
    requiredLamports: 5_000_000,
    requiredSol: 0.005,
    solanaPayUrl:
      "solana:6WmMZKkR3T3Zd2QEqQeU2w3Z7u1N7dt5Sc9m6vbPda1?amount=0.005&label=Mortem+PDA+Funding",
  },
}

const previewAgents = [
  {
    displayName: "devnet-trader",
    id: "01JAGENTPREVIEW",
    registryPda: "9xQeWvG816bUx9EPf7hP7v5R5R4VMY7nGmT9v",
    userPda: previewPdaInfo.pdaAddress,
  },
  {
    displayName: "pda-reconciler",
    id: "01JAGENTPENDING",
    registryPda: null,
    userPda: null,
  },
] satisfies Array<Pick<AgentListItem, "displayName" | "id" | "registryPda" | "userPda">>

const previewHistory = [
  {
    batchIndex: 0,
    batchPda: "BatchPda111111111111111111111111111111111",
    explorerLink:
      "https://explorer.solana.com/tx/5yPreviewAnchorSignature111111111111111111111111111111111?cluster=devnet",
    merkleRoot: "9f3f89dd6a0b8f0e8d2d4f8d5bdc2b7c3b5b5bd4a9dbb9c2b5e15ad9e46c47e5",
    slot: "339082441",
    traceCount: 12,
  },
] satisfies AnchorHistoryItem[]

export function OnchainPanel() {
  const { privyEnabled } = useDashboardAuth()

  if (!privyEnabled) {
    return (
      <OnchainFrame
        agents={previewAgents}
        history={previewHistory}
        mode="preview"
        pdaInfo={previewPdaInfo}
        selectedAgentId={previewAgents[0]?.id ?? null}
        walletAddress="H7PreviewWallet11111111111111111111111111111111"
      />
    )
  }

  return <AuthenticatedOnchainPanel />
}

function AuthenticatedOnchainPanel() {
  const { authenticated, login, ready, user } = usePrivy()
  const walletAddress = extractWalletAddress(user)
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [registeringUser, setRegisteringUser] = useState(false)
  const [registeringAgentId, setRegisteringAgentId] = useState<string | null>(null)
  const agents = trpc.agents.list.useQuery(undefined, {
    enabled: ready && authenticated,
    retry: 1,
  })
  const pdaInfo = trpc.onchain.getUserPdaInfo.useQuery(
    { wallet: walletAddress ?? "" },
    {
      enabled: ready && authenticated && walletAddress !== null,
      retry: 1,
    },
  )
  const history = trpc.onchain.getAnchorHistory.useQuery(
    { agentId: selectedAgentId ?? "" },
    {
      enabled: ready && authenticated && selectedAgentId !== null,
      retry: 1,
    },
  )
  const buildRegisterUserTx = trpc.onchain.buildRegisterUserTx.useMutation()
  const buildRegisterAgentTx = trpc.onchain.buildRegisterAgentTx.useMutation()
  const confirmRegistration = trpc.onchain.confirmRegistration.useMutation()

  const agentRows = agents.data ?? []
  const firstAgentId = agentRows[0]?.id ?? null

  useEffect(() => {
    if (selectedAgentId === null && firstAgentId !== null) {
      setSelectedAgentId(firstAgentId)
    }
  }, [firstAgentId, selectedAgentId])

  const refreshAll = async () => {
    await Promise.all([agents.refetch(), pdaInfo.refetch(), history.refetch()])
  }

  if (!ready || agents.isLoading) {
    return <OnchainSkeleton />
  }

  if (!authenticated) {
    return (
      <OnchainMessage
        title="Sign in to manage on-chain anchoring."
        description="PDA registration and funding are tied to your Privy wallet session."
        actionLabel="Sign in"
        onAction={() => login()}
      />
    )
  }

  if (walletAddress === null) {
    return (
      <OnchainMessage
        title="Connect a Solana wallet."
        description="Add or connect a Solana wallet in Privy before registering Mortem PDAs."
      />
    )
  }

  if (agents.isError || pdaInfo.isError) {
    return (
      <OnchainMessage
        title="On-chain data did not load."
        description="Retry the request, check the server app, or sign in again if the session expired."
        actionLabel="Retry"
        onAction={() => {
          void refreshAll()
        }}
      />
    )
  }

  const onRegisterUser = async () => {
    setRegisteringUser(true)
    setNotice(null)
    try {
      const tx = await buildRegisterUserTx.mutateAsync({ wallet: walletAddress })
      const signature = await signAndSendBase64Transaction(tx.txBase64)
      const confirmed = await confirmRegistration.mutateAsync({
        txSignature: signature,
        wallet: walletAddress,
      })
      setNotice(
        confirmed
          ? `Registered identity ${shorten(signature)}`
          : "Registration is still confirming.",
      )
      await refreshAll()
    } catch (error) {
      setNotice(errorMessage(error))
    } finally {
      setRegisteringUser(false)
    }
  }

  const onRegisterAgent = async (agentId: string) => {
    setRegisteringAgentId(agentId)
    setNotice(null)
    try {
      const tx = await buildRegisterAgentTx.mutateAsync({ agentId, wallet: walletAddress })
      if (tx === null) {
        setNotice("Agent access was not found.")
        return
      }

      const signature = await signAndSendBase64Transaction(tx.txBase64)
      const confirmed = await confirmRegistration.mutateAsync({
        agentId,
        txSignature: signature,
        wallet: walletAddress,
      })
      setNotice(
        confirmed
          ? `Registered agent ${shorten(signature)}`
          : "Agent registration is still confirming.",
      )
      await refreshAll()
    } catch (error) {
      setNotice(errorMessage(error))
    } finally {
      setRegisteringAgentId(null)
    }
  }

  return (
    <OnchainFrame
      agents={agentRows}
      history={history.data ?? []}
      historyLoading={history.isLoading}
      mode="private"
      notice={notice}
      onCheckFunding={() => {
        void pdaInfo.refetch()
      }}
      onRegisterAgent={onRegisterAgent}
      onRegisterUser={onRegisterUser}
      pdaInfo={pdaInfo.data ?? null}
      registeringAgentId={registeringAgentId}
      registeringUser={registeringUser}
      selectedAgentId={selectedAgentId}
      setSelectedAgentId={setSelectedAgentId}
      walletAddress={walletAddress}
    />
  )
}

function OnchainFrame({
  agents,
  history,
  historyLoading = false,
  mode,
  notice = null,
  onCheckFunding,
  onRegisterAgent,
  onRegisterUser,
  pdaInfo,
  registeringAgentId = null,
  registeringUser = false,
  selectedAgentId,
  setSelectedAgentId,
  walletAddress,
}: Readonly<{
  agents: Array<Pick<AgentListItem, "displayName" | "id" | "registryPda" | "userPda">>
  history: AnchorHistoryItem[]
  historyLoading?: boolean
  mode: "preview" | "private"
  notice?: string | null
  onCheckFunding?: () => void
  onRegisterAgent?: (agentId: string) => Promise<void>
  onRegisterUser?: () => Promise<void>
  pdaInfo: PdaInfo | null
  registeringAgentId?: string | null
  registeringUser?: boolean
  selectedAgentId: string | null
  setSelectedAgentId?: (agentId: string) => void
  walletAddress: string
}>) {
  const registeredUserPda = useMemo(
    () => agents.find((agent) => agent.userPda !== null)?.userPda ?? null,
    [agents],
  )
  const userRegistered = registeredUserPda !== null

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-7xl px-4 py-6 md:px-6 lg:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button asChild variant="ghost">
            <Link href="/app">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Agents
            </Link>
          </Button>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">devnet</Badge>
            {mode === "preview" ? <Badge variant="warning">preview</Badge> : null}
          </div>
        </div>

        <section className="mt-6 border border-border bg-card p-6 text-card-foreground shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">On-chain anchoring</p>
              <h1 className="mt-1 text-3xl font-semibold tracking-normal">PDA management</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
                Register identity and agent PDAs, fund rent for AnchorBatch accounts, and inspect
                committed batches.
              </p>
            </div>
            <div className="rounded-md border border-border bg-background p-3">
              <p className="text-xs font-medium text-muted-foreground">Wallet</p>
              <p className="mt-1 break-all font-mono text-xs">{walletAddress}</p>
            </div>
          </div>
          {notice === null ? null : (
            <div className="mt-5 rounded-md border border-border bg-background p-3 text-sm text-muted-foreground">
              {notice}
            </div>
          )}
        </section>

        <section className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
          <IdentityPdaSection
            onCheckFunding={onCheckFunding}
            onRegisterUser={onRegisterUser}
            pdaInfo={pdaInfo}
            registeringUser={registeringUser}
            userRegistered={userRegistered}
          />
          <AgentRegistrySection
            agents={agents}
            onRegisterAgent={onRegisterAgent}
            registeringAgentId={registeringAgentId}
            setSelectedAgentId={setSelectedAgentId}
            selectedAgentId={selectedAgentId}
            userRegistered={userRegistered}
          />
        </section>

        <AnchorHistorySection
          agents={agents}
          history={history}
          historyLoading={historyLoading}
          selectedAgentId={selectedAgentId}
          setSelectedAgentId={setSelectedAgentId}
        />
      </div>
    </main>
  )
}

function IdentityPdaSection({
  onCheckFunding,
  onRegisterUser,
  pdaInfo,
  registeringUser,
  userRegistered,
}: Readonly<{
  onCheckFunding: (() => void) | undefined
  onRegisterUser: (() => Promise<void>) | undefined
  pdaInfo: PdaInfo | null
  registeringUser: boolean
  userRegistered: boolean
}>) {
  const [showTopUp, setShowTopUp] = useState(false)

  if (pdaInfo === null) {
    return (
      <section className="border border-border bg-card p-6 text-card-foreground shadow-sm">
        <h2 className="text-xl font-semibold tracking-normal">Your Identity PDA</h2>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Loading PDA derivation and balance.
        </p>
      </section>
    )
  }

  const lowBalance = pdaInfo.balance < LOW_BALANCE_LAMPORTS

  return (
    <section className="border border-border bg-card text-card-foreground shadow-sm">
      <div className="border-b border-border p-6">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-xl font-semibold tracking-normal">Your Identity PDA</h2>
          <Badge variant={pdaInfo.funded ? "success" : "warning"}>
            {pdaInfo.funded ? "funded" : "needs funding"}
          </Badge>
          {userRegistered ? <Badge variant="success">registered</Badge> : null}
        </div>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          This PDA pays rent for AnchorBatch accounts committed by the Mortem backend wallet.
        </p>
      </div>

      <div className="p-6">
        {!userRegistered ? (
          <div className="rounded-md border border-border bg-background p-4">
            <p className="text-sm font-medium">Step 1: Register your on-chain identity</p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Phantom signs the registration transaction. Mortem never signs on your behalf.
            </p>
            <Button
              type="button"
              className="mt-4"
              disabled={onRegisterUser === undefined || registeringUser}
              onClick={() => {
                void onRegisterUser?.()
              }}
            >
              {registeringUser ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              )}
              Register
            </Button>
          </div>
        ) : (
          <div className="rounded-md border border-emerald-600/30 bg-emerald-500/10 p-4 text-emerald-900 dark:text-emerald-100">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              <p className="text-sm font-medium">Identity registered</p>
            </div>
          </div>
        )}

        <div className="mt-5 grid gap-3 md:grid-cols-2">
          <ReadonlyMetric label="PDA address" value={pdaInfo.pdaAddress} />
          <ReadonlyMetric label="Balance" value={`${lamportsToSol(pdaInfo.balance)} SOL`} />
          <ReadonlyMetric label="Required" value={`${pdaInfo.qr.requiredSol} SOL`} />
          <ReadonlyMetric label="Reserve" value={`${pdaInfo.qr.requiredLamports} lamports`} />
        </div>

        {lowBalance ? (
          <div className="mt-5 rounded-md border border-amber-600/30 bg-amber-500/10 p-3 text-sm text-amber-900 dark:text-amber-100">
            Low balance. Top up before the next batch commit.
          </div>
        ) : null}

        <div className="mt-5 flex flex-wrap gap-2">
          <Button type="button" variant="secondary" onClick={() => setShowTopUp((value) => !value)}>
            <QrCode className="h-4 w-4" aria-hidden="true" />
            {showTopUp || !pdaInfo.funded ? "Hide QR" : "Top up"}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={onCheckFunding === undefined}
            onClick={onCheckFunding}
          >
            <RefreshCcw className="h-4 w-4" aria-hidden="true" />
            Check funding status
          </Button>
        </div>

        {showTopUp || !pdaInfo.funded ? (
          <div className="mt-5">
            <PdaQrCode
              address={pdaInfo.qr.pdaAddress}
              amount={pdaInfo.qr.requiredSol}
              qrCodeDataUrl={pdaInfo.qr.qrCodeDataUrl}
              solanaPayUrl={pdaInfo.qr.solanaPayUrl}
            />
          </div>
        ) : null}
      </div>
    </section>
  )
}

function AgentRegistrySection({
  agents,
  onRegisterAgent,
  registeringAgentId,
  selectedAgentId,
  setSelectedAgentId,
  userRegistered,
}: Readonly<{
  agents: Array<Pick<AgentListItem, "displayName" | "id" | "registryPda" | "userPda">>
  onRegisterAgent: ((agentId: string) => Promise<void>) | undefined
  registeringAgentId: string | null
  selectedAgentId: string | null
  setSelectedAgentId: ((agentId: string) => void) | undefined
  userRegistered: boolean
}>) {
  return (
    <section className="border border-border bg-card text-card-foreground shadow-sm">
      <div className="border-b border-border p-6">
        <h2 className="text-xl font-semibold tracking-normal">Your Agents on Chain</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Register each agent under your identity PDA before batches can anchor.
        </p>
      </div>
      <div className="divide-y divide-border">
        {agents.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground">
            Create an agent before registering on chain.
          </div>
        ) : (
          agents.map((agent) => {
            const registered = agent.registryPda !== null
            const registering = registeringAgentId === agent.id

            return (
              <div key={agent.id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <button
                    type="button"
                    className="min-w-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    onClick={() => setSelectedAgentId?.(agent.id)}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{agent.displayName}</p>
                      <Badge variant={registered ? "success" : "warning"}>
                        {registered ? "registered" : "not registered"}
                      </Badge>
                      {selectedAgentId === agent.id ? (
                        <Badge variant="outline">history</Badge>
                      ) : null}
                    </div>
                    <p className="mt-2 break-all font-mono text-xs text-muted-foreground">
                      {agent.registryPda ?? agent.id}
                    </p>
                  </button>
                  {registered ? null : (
                    <Button
                      type="button"
                      size="sm"
                      disabled={!userRegistered || onRegisterAgent === undefined || registering}
                      onClick={() => {
                        void onRegisterAgent?.(agent.id)
                      }}
                    >
                      {registering ? (
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      ) : null}
                      Register on chain
                    </Button>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>
    </section>
  )
}

function AnchorHistorySection({
  agents,
  history,
  historyLoading,
  selectedAgentId,
  setSelectedAgentId,
}: Readonly<{
  agents: Array<Pick<AgentListItem, "displayName" | "id">>
  history: AnchorHistoryItem[]
  historyLoading: boolean
  selectedAgentId: string | null
  setSelectedAgentId: ((agentId: string) => void) | undefined
}>) {
  return (
    <section className="mt-6 border border-border bg-card text-card-foreground shadow-sm">
      <div className="flex flex-col gap-4 border-b border-border p-6 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-normal">Anchor History</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Batch commits for the selected agent.
          </p>
        </div>
        <select
          className="min-h-10 rounded-md border border-border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          value={selectedAgentId ?? ""}
          onChange={(event) => setSelectedAgentId?.(event.currentTarget.value)}
        >
          {agents.map((agent) => (
            <option key={agent.id} value={agent.id}>
              {agent.displayName}
            </option>
          ))}
        </select>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-left text-sm">
          <thead className="bg-muted/60 text-xs uppercase tracking-normal text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Batch index</th>
              <th className="px-4 py-3 font-medium">Trace count</th>
              <th className="px-4 py-3 font-medium">Slot</th>
              <th className="px-4 py-3 font-medium">Merkle root</th>
              <th className="px-4 py-3 font-medium">Explorer</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {historyLoading ? (
              <tr>
                <td className="px-4 py-6 text-muted-foreground" colSpan={5}>
                  Loading commits.
                </td>
              </tr>
            ) : history.length === 0 ? (
              <tr>
                <td className="px-4 py-6 text-muted-foreground" colSpan={5}>
                  No committed batches yet.
                </td>
              </tr>
            ) : (
              history.map((item) => (
                <tr key={`${item.batchIndex}-${item.slot ?? "pending"}`}>
                  <td className="px-4 py-3 font-mono text-xs">{item.batchIndex}</td>
                  <td className="px-4 py-3 font-mono text-xs">{item.traceCount}</td>
                  <td className="px-4 py-3 font-mono text-xs">{item.slot ?? "pending"}</td>
                  <td className="px-4 py-3 font-mono text-xs">
                    {item.merkleRoot === null ? "pending" : shorten(item.merkleRoot)}
                  </td>
                  <td className="px-4 py-3">
                    {item.explorerLink === null ? (
                      <span className="text-muted-foreground">pending</span>
                    ) : (
                      <a
                        href={item.explorerLink}
                        className="inline-flex items-center gap-1 underline-offset-4 hover:underline"
                        target="_blank"
                        rel="noreferrer"
                      >
                        Explorer
                        <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                      </a>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function OnchainSkeleton() {
  return (
    <main
      className="min-h-screen bg-background px-4 py-6 text-foreground md:px-6 lg:px-8"
      aria-busy="true"
    >
      <div className="mx-auto max-w-7xl">
        <div className="h-10 w-28 rounded-md bg-muted" />
        <section className="mt-6 h-48 border border-border bg-card p-6 shadow-sm" />
        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
          <section className="h-96 border border-border bg-card p-6 shadow-sm" />
          <section className="h-96 border border-border bg-card p-6 shadow-sm" />
        </div>
      </div>
    </main>
  )
}

function OnchainMessage({
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
      <section className="w-full max-w-md border border-border bg-card p-6 text-card-foreground shadow-sm">
        <AlertCircle className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
        <h1 className="mt-4 text-xl font-semibold tracking-normal">{title}</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          {actionLabel === undefined || onAction === undefined ? null : (
            <Button type="button" onClick={onAction}>
              {actionLabel === "Retry" ? (
                <RefreshCcw className="h-4 w-4" aria-hidden="true" />
              ) : null}
              {actionLabel}
            </Button>
          )}
          <Button asChild variant="secondary">
            <Link href="/app">Agent list</Link>
          </Button>
        </div>
      </section>
    </main>
  )
}

function ReadonlyMetric({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="rounded-md border border-border bg-background p-3">
      <p className="text-xs font-medium uppercase tracking-normal text-muted-foreground">{label}</p>
      <p className="mt-2 break-all font-mono text-xs">{value}</p>
    </div>
  )
}

function extractWalletAddress(user: unknown): string | null {
  if (!isRecord(user)) {
    return null
  }

  const wallet = user.wallet
  if (isRecord(wallet) && typeof wallet.address === "string") {
    return wallet.address
  }

  const linkedAccounts = user.linkedAccounts
  if (Array.isArray(linkedAccounts)) {
    for (const account of linkedAccounts) {
      if (!isRecord(account)) {
        continue
      }

      if (account.type === "wallet" && typeof account.address === "string") {
        return account.address
      }
    }
  }

  return null
}

async function signAndSendBase64Transaction(txBase64: string): Promise<string> {
  const provider = getPhantomProvider()
  if (provider === null) {
    throw new Error("Phantom wallet was not found.")
  }

  await provider.connect()
  const transaction = transactionFromBase64(txBase64)
  const connection = new Connection(DEVNET_RPC_URL, "confirmed")

  if (provider.signAndSendTransaction !== undefined) {
    const { signature } = await provider.signAndSendTransaction(transaction)
    await connection.confirmTransaction(signature, "confirmed")
    return signature
  }

  if (provider.signTransaction === undefined) {
    throw new Error("Phantom cannot sign this transaction.")
  }

  const signed = await provider.signTransaction(transaction)
  const signature = await connection.sendRawTransaction(signed.serialize(), {
    skipPreflight: false,
  })
  await connection.confirmTransaction(signature, "confirmed")
  return signature
}

function transactionFromBase64(txBase64: string): Transaction {
  const binary = atob(txBase64)
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
  return Transaction.from(bytes)
}

function getPhantomProvider(): PhantomProvider | null {
  const candidate = (globalThis as typeof globalThis & { solana?: PhantomProvider }).solana
  if (candidate === undefined) {
    return null
  }

  return candidate
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "The wallet transaction did not complete."
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function lamportsToSol(lamports: number): string {
  return (lamports / LAMPORTS_PER_SOL).toFixed(6)
}

function shorten(value: string): string {
  if (value.length <= 20) {
    return value
  }

  return `${value.slice(0, 10)}...${value.slice(-10)}`
}
