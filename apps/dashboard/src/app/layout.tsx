// The dashboard root layout installs brand fonts, tokens, and client providers for auth and tRPC.
// Route components remain focused on product flows while this shell owns shared document structure.
import type { Metadata } from "next"
import { Instrument_Serif, Inter_Tight, JetBrains_Mono } from "next/font/google"
import type { ReactNode } from "react"
import "./globals.css"
import { DashboardProviders } from "@/components/providers"

const interTight = Inter_Tight({
  subsets: ["latin"],
  variable: "--font-inter-tight",
  weight: ["400", "500", "600", "700", "800"],
})

const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  variable: "--font-instrument-serif",
  weight: "400",
  style: ["normal", "italic"],
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  weight: ["400", "500", "600"],
})

const siteUrl = process.env.NEXT_PUBLIC_MORTEM_SITE_URL ?? "https://mortem.dev"

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Mortem — Forensics for onchain trading agents",
    template: "%s · Mortem",
  },
  description:
    "Mortem files an autopsy on every agent run: full traces, cause of death, and the fix — before the next trade.",
  applicationName: "Mortem",
  icons: {
    icon: "/mortem-icon.svg",
    shortcut: "/mortem-icon.svg",
    apple: "/mortem-icon.svg",
  },
  openGraph: {
    type: "website",
    siteName: "Mortem",
    title: "Mortem — Forensics for onchain trading agents",
    description:
      "File an autopsy on every agent run: full traces, cause of death, and the fix — before the next trade.",
    url: siteUrl,
  },
  twitter: {
    card: "summary_large_image",
    title: "Mortem — Forensics for onchain trading agents",
    description:
      "File an autopsy on every agent run: full traces, cause of death, and the fix — before the next trade.",
  },
}

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${interTight.variable} ${instrumentSerif.variable} ${jetbrainsMono.variable} antialiased`}
      >
        <DashboardProviders>{children}</DashboardProviders>
      </body>
    </html>
  )
}
