import Link from "next/link"

import { SignOutButton } from "@/components/sign-out-button"

type AppShellProps = {
  email: string
  children: React.ReactNode
}

const links = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/ledger", label: "Ledger" },
  { href: "/review", label: "Review" },
  { href: "/settings", label: "Settings" },
  { href: "/ops/queues", label: "Queues" },
  { href: "/ops/extraction", label: "Extraction" },
]

export function AppShell({ email, children }: AppShellProps) {
  return (
    <div className="min-h-svh bg-zinc-50 text-zinc-950">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-6 py-4">
          <div className="flex items-center gap-8">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.24em] text-zinc-500">
                Irene
              </p>
              <p className="text-sm text-zinc-600">{email}</p>
            </div>
            <nav className="flex items-center gap-3 text-sm">
              {links.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="rounded-full px-3 py-2 text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-950"
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          </div>
          <SignOutButton />
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  )
}
