// The /app layout installs the persistent workspace chrome (brand header, navigation, breadcrumbs)
// so every authenticated screen shares one shell instead of repeating its own header and back link.
import type { ReactNode } from "react"
import { AppShell } from "@/components/app-shell"

export default function AppLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <AppShell>{children}</AppShell>
}
