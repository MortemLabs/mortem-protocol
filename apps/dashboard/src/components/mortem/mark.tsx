// The M-Block mark per Mortem brand spec §2.1. 120u red square, two 16u legs,
// a 16u miter V with apex at y=62, and a 4u red-on-paper bar at y=108. The bar
// drops below 64px (the favicon variant) per the size table.
import type { SVGProps } from "react"

import { cn } from "@/lib/utils"

type MarkProps = {
  size?: number
  withBar?: boolean
  className?: string
} & Omit<SVGProps<SVGSVGElement>, "className" | "width" | "height">

export function Mark({ className, size = 32, withBar, ...rest }: MarkProps) {
  const showBar = withBar ?? size >= 32
  const paper = "hsl(var(--paper))"
  const ink = "hsl(var(--ink))"
  const signal = "hsl(var(--signal))"

  // Favicon-floor widths per spec: legs 24u, V 18u below 64px.
  const legWidth = size < 64 ? 24 : 16
  const vWidth = size < 64 ? 18 : 16
  const legHeight = 84
  const legY = 18
  const legLeftX = 18
  const legRightX = 120 - 18 - legWidth

  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 120 120"
      role="img"
      shapeRendering="crispEdges"
      className={cn("inline-block align-middle", className)}
      {...rest}
    >
      <rect x={0} y={0} width={120} height={120} fill={signal} />
      <rect x={legLeftX} y={legY} width={legWidth} height={legHeight} fill={paper} />
      <rect x={legRightX} y={legY} width={legWidth} height={legHeight} fill={paper} />
      <polygon
        points={`${legLeftX + legWidth},${legY} ${legRightX},${legY} 60,${62 + vWidth / 2} 60,62`}
        fill={paper}
        stroke={paper}
        strokeLinejoin="miter"
        strokeWidth={0}
      />
      {/* Miter V with 16u stroke — drawn as four explicit triangles for crisp paper-on-red joins. */}
      <polygon points={`${legLeftX + legWidth},${legY} ${60 - vWidth / 2},62 60,72 ${legLeftX + legWidth},${legY + vWidth}`} fill={paper} />
      <polygon points={`${legRightX},${legY} ${60 + vWidth / 2},62 60,72 ${legRightX},${legY + vWidth}`} fill={paper} />
      {showBar ? <rect x={18} y={108} width={84} height={4} fill={ink} /> : null}
    </svg>
  )
}

export function Wordmark({ className, size = 24 }: { className?: string; size?: number }) {
  return (
    <span className={cn("inline-flex items-center gap-2 align-middle", className)}>
      <Mark size={size} />
      <span className="font-display text-[1.35em] leading-none">
        Mortem<span className="text-signal">.</span>
      </span>
    </span>
  )
}
