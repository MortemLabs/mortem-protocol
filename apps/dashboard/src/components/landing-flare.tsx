"use client"

import { useEffect, useRef } from "react"

type FlareStyle = React.CSSProperties & {
  "--flare-x": string
  "--flare-y": string
  "--flare-grid-opacity": string
}

export function LandingFlare() {
  const flareRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let frame = 0

    function setGridFocus(x: number, y: number, opacity = "0.86") {
      const flare = flareRef.current

      if (!flare) {
        return
      }

      flare.style.setProperty("--flare-x", `${x}px`)
      flare.style.setProperty("--flare-y", `${y}px`)
      flare.style.setProperty("--flare-grid-opacity", opacity)
    }

    function handlePointerMove(event: PointerEvent) {
      cancelAnimationFrame(frame)

      frame = requestAnimationFrame(() => {
        const bounds = flareRef.current?.getBoundingClientRect()

        if (!bounds) {
          return
        }

        const x = event.clientX - bounds.left
        const y = event.clientY - bounds.top

        setGridFocus(x, y)
      })
    }

    function handlePointerLeave() {
      setGridFocus(window.innerWidth / 2, window.innerHeight * 0.18, "0.66")
    }

    window.addEventListener("pointermove", handlePointerMove, { passive: true })
    document.addEventListener("pointerleave", handlePointerLeave)

    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener("pointermove", handlePointerMove)
      document.removeEventListener("pointerleave", handlePointerLeave)
    }
  }, [])

  return (
    <div
      ref={flareRef}
      className="landing-flare"
      aria-hidden="true"
      style={
        {
          "--flare-grid-opacity": "0.66",
          "--flare-x": "50vw",
          "--flare-y": "18vh",
        } as FlareStyle
      }
    >
      <span className="landing-flare__grid-focus" />
    </div>
  )
}
