// The app shell owns the persistent authenticated chrome: brand header, primary navigation,
// breadcrumbs, and the in-app account control. Child screens register human labels for dynamic
// route segments (agent name, trace summary) so the breadcrumb trail reads like a case file.
"use client"

import { Mark } from "@/components/mortem/mark"
import { useDashboardAuth } from "@/components/providers"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { usePrivy } from "@privy-io/react-auth"
import { ChevronRight, LogOut, Plus } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react"

type Crumb = {
  current: boolean
  href: string
  label: string
}

type AppChromeValue = {
  registerLabel: (id: string, label: string) => void
}

const AppChromeContext = createContext<AppChromeValue>({ registerLabel: () => undefined })

export function useRegisterCrumb(id: string | null, label: string | null | undefined) {
  const { registerLabel } = useContext(AppChromeContext)

  useEffect(() => {
    if (id !== null && label !== null && label !== undefined && label.length > 0) {
      registerLabel(id, label)
    }
  }, [id, label, registerLabel])
}

export function AppShell({ children }: Readonly<{ children: ReactNode }>) {
  const [labels, setLabels] = useState<Record<string, string>>({})
  const registerLabel = useCallback((id: string, label: string) => {
    setLabels((current) => (current[id] === label ? current : { ...current, [id]: label }))
  }, [])
  const pathname = usePathname()
  const crumbs = useMemo(() => buildCrumbs(pathname, labels), [pathname, labels])
  const value = useMemo(() => ({ registerLabel }), [registerLabel])

  return (
    <AppChromeContext.Provider value={value}>
      <div className="flex min-h-screen flex-col bg-background text-foreground">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:border focus:border-signal focus:bg-ink focus:px-4 focus:py-2 focus:font-mono focus:text-[0.6875rem] focus:uppercase focus:tracking-[0.16em] focus:text-paper"
        >
          Skip to content
        </a>
        <div className="tape h-1 w-full" aria-hidden="true" />
        <header className="border-b border-line">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 md:px-6 lg:px-8">
            <Link
              href="/app"
              className="inline-flex items-center gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Mark size={28} alt="Mortem" className="-mr-1" />
              <span className="font-display text-2xl leading-none">
                Mortem<span className="pl-0.5 text-signal">.</span>
              </span>
            </Link>
            <nav className="flex items-center gap-1 sm:gap-2" aria-label="Workspace">
              <NavLink active={isAgentsActive(pathname)} href="/app">
                Agents
              </NavLink>
              <Button asChild size="sm">
                <Link href="/app/agents/new">
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  <span className="hidden sm:inline">File new agent</span>
                  <span className="sm:hidden">New</span>
                </Link>
              </Button>
              <AccountControl />
            </nav>
          </div>
        </header>

        {crumbs.length > 1 ? (
          <nav
            aria-label="Breadcrumb"
            className="border-b border-line bg-ink-2/40"
          >
            <ol className="mx-auto flex max-w-7xl flex-wrap items-center gap-1 px-4 py-2 font-mono text-[0.6875rem] uppercase tracking-[0.16em] text-fg-muted md:px-6 lg:px-8">
              {crumbs.map((crumb) => (
                <li key={crumb.href} className="flex items-center gap-1">
                  {crumb.current ? (
                    <span aria-current="page" className="text-paper">
                      {crumb.label}
                    </span>
                  ) : (
                    <Link
                      href={crumb.href}
                      className="hover:text-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {crumb.label}
                    </Link>
                  )}
                  {crumb.current ? null : (
                    <ChevronRight className="h-3 w-3 text-line" aria-hidden="true" />
                  )}
                </li>
              ))}
            </ol>
          </nav>
        ) : null}

        <main id="main-content" className="flex-1">
          {children}
        </main>
      </div>
    </AppChromeContext.Provider>
  )
}

function NavLink({
  active,
  children,
  href,
}: Readonly<{ active: boolean; children: ReactNode; href: string }>) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "inline-flex min-h-9 items-center px-3 font-mono text-[0.6875rem] uppercase tracking-[0.16em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active ? "text-paper" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </Link>
  )
}

function AccountControl() {
  const { privyEnabled } = useDashboardAuth()

  if (!privyEnabled) {
    return (
      <Link
        href="/login"
        className="inline-flex min-h-9 items-center px-3 font-mono text-[0.6875rem] uppercase tracking-[0.16em] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        Account
      </Link>
    )
  }

  return <PrivyAccountControl />
}

function PrivyAccountControl() {
  const { authenticated, login, logout, ready } = usePrivy()

  if (!ready) {
    return (
      <span className="inline-flex min-h-9 items-center px-3 font-mono text-[0.6875rem] uppercase tracking-[0.16em] text-fg-muted">
        …
      </span>
    )
  }

  if (!authenticated) {
    return (
      <Button type="button" size="sm" variant="outline" onClick={() => login()}>
        Sign in
      </Button>
    )
  }

  return (
    <Button type="button" size="sm" variant="ghost" onClick={() => logout()}>
      <LogOut className="h-4 w-4" aria-hidden="true" />
      <span className="hidden sm:inline">Sign out</span>
    </Button>
  )
}

function isAgentsActive(pathname: string): boolean {
  return pathname === "/app" || pathname.startsWith("/app/agents")
}

function buildCrumbs(pathname: string, labels: Record<string, string>): Crumb[] {
  const crumbs: Crumb[] = [{ current: pathname === "/app", href: "/app", label: "Agents" }]

  if (pathname === "/app") {
    return crumbs
  }

  const segments = pathname.split("/").filter((segment) => segment.length > 0)
  // segments[0] === "app"
  if (segments[1] === "agents") {
    const third = segments[2]
    if (third === "new") {
      crumbs.push({ current: true, href: pathname, label: "New agent" })
      return crumbs
    }

    if (third !== undefined) {
      const agentHref = `/app/agents/${third}`
      const agentLabel = labels[third] ?? shortId(third)
      const fourth = segments[3]
      crumbs.push({
        current: fourth === undefined,
        href: agentHref,
        label: agentLabel,
      })

      if (fourth === "traces") {
        crumbs.push({ current: true, href: pathname, label: "Traces" })
      } else if (fourth === "settings") {
        crumbs.push({ current: true, href: pathname, label: "Settings" })
      }

      return crumbs
    }
  }

  if (segments[1] === "traces") {
    const traceId = segments[2]
    if (traceId !== undefined) {
      crumbs.push({
        current: true,
        href: pathname,
        label: labels[traceId] ?? `Trace ${shortId(traceId)}`,
      })
    }
  }

  return crumbs
}

function shortId(value: string): string {
  if (value.length <= 10) {
    return value
  }

  return `${value.slice(0, 6)}…${value.slice(-4)}`
}
