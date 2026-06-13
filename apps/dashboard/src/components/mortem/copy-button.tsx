"use client"

import { Button } from "@/components/ui/button"
import { Copy } from "lucide-react"
import { useState } from "react"

type CopyButtonProps = {
  label: string
  size?: "default" | "icon" | "lg" | "sm"
  value: string
}

export function CopyButton({
  label,
  size = "default",
  value,
}: Readonly<CopyButtonProps>) {
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
    <Button type="button" variant="outline" size={size} onClick={() => void copy()}>
      <Copy className="h-4 w-4" aria-hidden="true" />
      <span aria-live="polite">{copied ? "Filed." : label}</span>
    </Button>
  )
}
