import { RiFlashlightFill } from "@remixicon/react"

import { BottomTabBar } from "@/components/bottom-tab-bar"
import { ProfileAvatar } from "@/components/profile-avatar"

type AppShellProps = {
  user: {
    name: string
    image?: string | null
  }
  children: React.ReactNode
}

export function AppShell({ user, children }: AppShellProps) {
  return (
    <div className="min-h-svh bg-transparent text-foreground">
      <header className="px-4 pt-4 md:px-6">
        <div className="neo-shell mx-auto flex max-w-6xl items-center justify-between border border-white/8 px-4 py-3 md:px-5">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center border border-white/10 bg-white/4 text-[var(--neo-yellow)]">
              <RiFlashlightFill className="size-5" />
            </div>
            <div>
              <p className="neo-kicker text-[0.62rem]">
                Irene
              </p>
              <p className="text-sm font-semibold text-white">{user.name}</p>
            </div>
          </div>
          <ProfileAvatar
            name={user.name}
            image={user.image}
            className="size-11 rounded-full border-white/12"
          />
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 pb-28 pt-6 md:px-6 md:pb-32 md:pt-8">
        {children}
      </main>
      <BottomTabBar />
    </div>
  )
}
