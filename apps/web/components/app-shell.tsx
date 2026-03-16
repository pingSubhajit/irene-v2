import { RiFlashlightFill } from "@remixicon/react"

import { BottomTabBar } from "@/components/bottom-tab-bar"

type AppShellProps = {
  email: string
  children: React.ReactNode
}

export function AppShell({ email, children }: AppShellProps) {
  const label = email.split("@")[0] ?? email

  return (
    <div className="min-h-svh bg-transparent text-foreground">
      <header className="sticky top-0 z-40 px-4 pt-4 md:px-6">
        <div className="neo-shell mx-auto flex max-w-6xl items-center justify-between border border-white/8 px-4 py-3 md:px-5">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center border border-white/10 bg-white/4 text-[var(--neo-yellow)]">
              <RiFlashlightFill className="size-5" />
            </div>
            <div>
              <p className="neo-kicker text-[0.62rem]">
                Irene
              </p>
              <p className="text-sm text-white/62">welcome back, {label}</p>
            </div>
          </div>
          <div className="flex size-11 items-center justify-center border border-white/10 bg-white/4 text-sm uppercase tracking-[0.2em] text-white/56">
            {label.slice(0, 1)}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 pb-28 pt-6 md:px-6 md:pb-32 md:pt-8">
        {children}
      </main>
      <BottomTabBar />
    </div>
  )
}
