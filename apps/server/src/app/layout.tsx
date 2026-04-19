// The server app layout exists so Next.js can build App Router route handlers cleanly. User-facing
// dashboard UI lives in apps/dashboard later in the build.
import type { ReactNode } from "react"

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
