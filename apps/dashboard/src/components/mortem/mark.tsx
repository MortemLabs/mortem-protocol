// The Mortem mark renders the canonical SVG shipped at /mortem-icon.svg.
// Edit that file to update the mark — this component just embeds it.
import { cn } from "@/lib/utils"

type MarkProps = {
  size?: number
  className?: string
  alt?: string
}

export function Mark({ className, size = 32, alt = "" }: MarkProps) {
  // Plain <img> avoids next/image optimization for SVGs and keeps the
  // exact bytes from /mortem-icon.svg with no remote font/raster pipeline.
  return (
    <img
      src="/mortem-icon.svg"
      alt={alt}
      width={size}
      height={size}
      className={cn("inline-block align-middle", className)}
      decoding="async"
    />
  )
}

export function Wordmark({ className, size = 24 }: { className?: string; size?: number }) {
  return (
    <span className={cn("inline-flex items-center gap-2 align-middle", className)}>
      <Mark size={size} alt="Mortem" />
      <span className="font-display text-2xl leading-none">
        Mortem<span className="text-signal">.</span>
      </span>
    </span>
  )
}
