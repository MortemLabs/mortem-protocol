// Static-ish OG card generated at the edge so shared links render an on-brand
// preview. Colors mirror the ink/paper/signal tokens from globals.css.
import { ImageResponse } from "next/og"

export const runtime = "edge"
export const alt = "Mortem — Forensics for onchain trading agents"
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

const ink = "#0E0D0C"
const paper = "#EDEEE9"
const signal = "#DC2626"

export default function OpengraphImage() {
  return new ImageResponse(
    <div
      style={{
        height: "100%",
        width: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        backgroundColor: ink,
        color: paper,
        padding: "72px",
        fontFamily: "sans-serif",
      }}
    >
      <div style={{ display: "flex", height: "10px", backgroundColor: signal }} />
      <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
        <div style={{ display: "flex", alignItems: "flex-end", fontSize: "120px", fontWeight: 800 }}>
          Mortem
          <span style={{ color: signal }}>.</span>
        </div>
        <div style={{ fontSize: "40px", color: "#A8A8A2", maxWidth: "900px", lineHeight: 1.2 }}>
          File an autopsy on every agent run — full traces, cause of death, and the fix before the
          next trade.
        </div>
      </div>
      <div
        style={{
          display: "flex",
          fontSize: "26px",
          letterSpacing: "0.2em",
          textTransform: "uppercase",
          color: "#A8A8A2",
        }}
      >
        Forensics for onchain trading agents
      </div>
    </div>,
    size,
  )
}
