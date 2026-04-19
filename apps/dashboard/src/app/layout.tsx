// The dashboard root layout installs global fonts, tokens, and client providers for auth and tRPC.
// Route components remain focused on product flows while this shell owns shared document structure.
import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import type { ReactNode } from "react"
import "./globals.css"
import { DashboardProviders } from "@/components/providers"

const geistSans = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
})

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
})

export const metadata: Metadata = {
  title: "Mortem",
  description: "Observability and debugging for TypeScript AI agents running on Solana.",
}

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <DashboardProviders>{children}</DashboardProviders>
      </body>
    </html>
  )
}
