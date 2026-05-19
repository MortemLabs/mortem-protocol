import { cn } from "@/lib/utils"

export type PnLChartPoint = {
  drawdown: number
  label: string
  timestamp: number
  value: number
}

export type PnLChartAnnotation = {
  label: string
  timestamp: number
  tone?: "paper" | "signal"
}

type PnLChartProps = {
  annotations?: PnLChartAnnotation[]
  className?: string
  compact?: boolean
  lineTone?: "paper" | "signal"
  points: PnLChartPoint[]
  showDrawdown?: boolean
}

const PAPER_LINE = "hsl(var(--paper))"
const PAPER_FILL = "hsl(var(--paper) / 0.04)"
const SIGNAL_LINE = "hsl(var(--signal))"
const SIGNAL_FILL = "hsl(var(--signal) / 0.08)"
const GRID_LINE = "hsl(var(--line))"
const GRID_DIM = "hsl(var(--line-dim))"
const MUTED_TEXT = "hsl(var(--fg-muted))"

export function PnLChart({
  annotations = [],
  className,
  compact = false,
  lineTone = "paper",
  points,
  showDrawdown = true,
}: Readonly<PnLChartProps>) {
  if (points.length === 0) {
    return null
  }

  const width = compact ? 144 : 760
  const height = compact ? 48 : 260
  const padding = compact
    ? { bottom: 6, left: 2, right: 2, top: 6 }
    : { bottom: 30, left: 40, right: 20, top: 18 }

  const values = points.map((point) => point.value)
  const peaks = buildRunningPeak(points)
  const minValue = Math.min(...values, 0)
  const maxValue = Math.max(...values, 0)
  const valueSpan = maxValue - minValue || 1
  const chartWidth = Math.max(1, width - padding.left - padding.right)
  const chartHeight = Math.max(1, height - padding.top - padding.bottom)

  const xAt = (index: number) =>
    padding.left + (points.length === 1 ? chartWidth / 2 : (index / (points.length - 1)) * chartWidth)
  const yAt = (value: number) => padding.top + ((maxValue - value) / valueSpan) * chartHeight

  const polyline = points.map((point, index) => ({ x: xAt(index), y: yAt(point.value) }))
  const areaPath = `${buildLinePath(polyline)} L ${polyline.at(-1)?.x ?? 0} ${height - padding.bottom} L ${
    polyline[0]?.x ?? 0
  } ${height - padding.bottom} Z`
  const linePath = buildLinePath(polyline)
  const peakPath = buildLinePath(
    peaks.map((value, index) => ({
      x: xAt(index),
      y: yAt(value),
    })),
  )

  const zeroLineY = yAt(0)
  const axisLabels = compact
    ? null
    : {
        first: points[0]?.label ?? "",
        last: points.at(-1)?.label ?? "",
        max: formatAxisValue(maxValue),
        min: formatAxisValue(minValue),
      }
  const stroke = lineTone === "signal" ? SIGNAL_LINE : PAPER_LINE
  const fill = lineTone === "signal" ? SIGNAL_FILL : PAPER_FILL

  return (
    <div className={cn("w-full", className)}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className={cn("h-full w-full", compact ? "overflow-visible" : "min-h-[220px]")}
        role="img"
        aria-label="Agent cumulative profit and loss chart"
      >
        {compact ? null : (
          <>
            {[0, 0.25, 0.5, 0.75, 1].map((step) => {
              const y = padding.top + chartHeight * step
              return (
                <line
                  key={step}
                  x1={padding.left}
                  x2={width - padding.right}
                  y1={y}
                  y2={y}
                  stroke={step === 0.5 ? GRID_LINE : GRID_DIM}
                  strokeWidth="1"
                />
              )
            })}
            {minValue < 0 && maxValue > 0 ? (
              <line
                x1={padding.left}
                x2={width - padding.right}
                y1={zeroLineY}
                y2={zeroLineY}
                stroke={SIGNAL_LINE}
                strokeDasharray="4 6"
                strokeWidth="1"
              />
            ) : null}
          </>
        )}

        {!compact ? <path d={areaPath} fill={fill} /> : null}
        {!compact && showDrawdown ? (
          <path
            d={peakPath}
            fill="none"
            stroke={SIGNAL_LINE}
            strokeDasharray="5 7"
            strokeOpacity="0.72"
            strokeWidth="1"
          />
        ) : null}
        <path
          d={linePath}
          fill="none"
          stroke={stroke}
          strokeLinecap="square"
          strokeLinejoin="miter"
          strokeWidth={compact ? 1.5 : 2}
        />
        {polyline.at(-1) ? (
          <rect
            x={(polyline.at(-1)?.x ?? 0) - (compact ? 2 : 3)}
            y={(polyline.at(-1)?.y ?? 0) - (compact ? 2 : 3)}
            width={compact ? 4 : 6}
            height={compact ? 4 : 6}
            fill={stroke}
          />
        ) : null}

        {compact
          ? null
          : annotations.flatMap((annotation) => {
              const pointIndex = points.findIndex((point) => point.timestamp === annotation.timestamp)
              if (pointIndex === -1) {
                return []
              }

              const point = polyline[pointIndex]
              if (point === undefined) {
                return []
              }

              const tone = annotation.tone === "paper" ? PAPER_LINE : SIGNAL_LINE
              const textX = pointIndex > points.length - 3 ? point.x - 6 : point.x + 6
              const anchor = pointIndex > points.length - 3 ? "end" : "start"

              return [
                <line
                  key={`${annotation.timestamp}-line`}
                  x1={point.x}
                  x2={point.x}
                  y1={padding.top}
                  y2={height - padding.bottom}
                  stroke={tone}
                  strokeDasharray="2 6"
                  strokeOpacity="0.45"
                  strokeWidth="1"
                />,
                <rect
                  key={`${annotation.timestamp}-mark`}
                  x={point.x - 3}
                  y={point.y - 3}
                  width={6}
                  height={6}
                  fill={tone}
                />,
                <text
                  key={`${annotation.timestamp}-label`}
                  x={textX}
                  y={Math.max(padding.top + 12, point.y - 10)}
                  fill={tone}
                  fontFamily="var(--font-jetbrains-mono), ui-monospace, SFMono-Regular, monospace"
                  fontSize="10"
                  letterSpacing="0.16em"
                  textAnchor={anchor}
                >
                  {annotation.label.toUpperCase()}
                </text>,
              ]
            })}

        {axisLabels === null ? null : (
          <>
            <text
              x={padding.left}
              y={height - 8}
              fill={MUTED_TEXT}
              fontFamily="var(--font-jetbrains-mono), ui-monospace, SFMono-Regular, monospace"
              fontSize="10"
              letterSpacing="0.16em"
            >
              {axisLabels.first}
            </text>
            <text
              x={width - padding.right}
              y={height - 8}
              fill={MUTED_TEXT}
              fontFamily="var(--font-jetbrains-mono), ui-monospace, SFMono-Regular, monospace"
              fontSize="10"
              letterSpacing="0.16em"
              textAnchor="end"
            >
              {axisLabels.last}
            </text>
            <text
              x={8}
              y={padding.top + 4}
              fill={MUTED_TEXT}
              fontFamily="var(--font-jetbrains-mono), ui-monospace, SFMono-Regular, monospace"
              fontSize="10"
              letterSpacing="0.16em"
            >
              {axisLabels.max}
            </text>
            <text
              x={8}
              y={height - padding.bottom}
              fill={MUTED_TEXT}
              fontFamily="var(--font-jetbrains-mono), ui-monospace, SFMono-Regular, monospace"
              fontSize="10"
              letterSpacing="0.16em"
            >
              {axisLabels.min}
            </text>
          </>
        )}
      </svg>
    </div>
  )
}

function buildLinePath(points: Array<{ x: number; y: number }>): string {
  return points.reduce(
    (path, point, index) => `${path}${index === 0 ? "M" : " L"} ${point.x} ${point.y}`,
    "",
  )
}

function buildRunningPeak(points: PnLChartPoint[]): number[] {
  let peak = Number.NEGATIVE_INFINITY

  return points.map((point) => {
    peak = Math.max(peak, point.value)
    return peak
  })
}

function formatAxisValue(value: number): string {
  const abs = Math.abs(value)
  if (abs >= 1000) {
    return `${value < 0 ? "-" : ""}$${(abs / 1000).toFixed(1)}K`
  }

  return `${value < 0 ? "-" : ""}$${abs.toFixed(abs >= 100 ? 0 : 1)}`
}
