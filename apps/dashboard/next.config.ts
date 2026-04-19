// The dashboard Next.js config stays minimal while Turborepo handles workspace orchestration.
// Runtime integrations are wired inside App Router providers and route-level components.
import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  reactStrictMode: true,
}

export default nextConfig
