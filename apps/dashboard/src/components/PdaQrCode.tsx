// PDA QR codes render Solana Pay funding links for wallets that scan QR codes or open deep links.
// The component keeps copy actions local so it can be reused in the on-chain page without extra state.
"use client"

import { Button } from "@/components/ui/button"
import { Copy } from "lucide-react"
import { useState } from "react"

export function PdaQrCode({
  address,
  amount,
  qrCodeDataUrl,
  solanaPayUrl,
}: Readonly<{
  address: string
  amount: number
  qrCodeDataUrl: string
  solanaPayUrl: string
}>) {
  return (
    <div className="rounded-md border border-border bg-background p-4">
      <div className="flex flex-col gap-4 md:flex-row md:items-start">
        <img
          src={qrCodeDataUrl}
          width={256}
          height={256}
          alt="Solana Pay QR code for PDA funding"
          className="h-64 w-64 rounded-md border border-border bg-white p-2"
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Scan with Phantom or Solflare to fund</p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Compatible with Phantom, Solflare, Backpack
          </p>
          <a
            href={solanaPayUrl}
            className="mt-4 inline-flex min-h-10 items-center rounded-md border border-border px-3 text-sm font-medium underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            title="Compatible with Phantom, Solflare, Backpack"
          >
            Open wallet
          </a>

          <div className="mt-5 space-y-3">
            <FundingDetail label="Amount" value={`${amount} SOL`} />
            <FundingDetail label="Address" value={address} />
            <FundingDetail label="Solana Pay URL" value={solanaPayUrl} />
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <CopyButton label="Copy address" value={address} />
            <CopyButton label="Copy URL" value={solanaPayUrl} />
          </div>
        </div>
      </div>
    </div>
  )
}

function FundingDetail({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-normal text-muted-foreground">{label}</p>
      <p className="mt-1 break-all font-mono text-xs">{value}</p>
    </div>
  )
}

function CopyButton({ label, value }: Readonly<{ label: string; value: string }>) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      setCopied(false)
    }
  }

  return (
    <Button type="button" variant="outline" onClick={copy}>
      <Copy className="h-4 w-4" aria-hidden="true" />
      {copied ? "Copied" : label}
    </Button>
  )
}
