import { BackfillStatusBanner } from "@/components/backfill-status-banner"
import { BottomTabBar } from "@/components/bottom-tab-bar"
import { ProfileAvatar } from "@/components/profile-avatar"

type AppShellProps = {
  user: {
    name: string
    image?: string | null
  }
  reviewAttentionCount?: number
  backfillRunning?: boolean
  children: React.ReactNode
}

function getGreetingName(name: string) {
  return name.trim().split(/\s+/)[0] || "there"
}

export function AppShell({
  user,
  reviewAttentionCount = 0,
  backfillRunning = false,
  children,
}: AppShellProps) {
  const greetingName = getGreetingName(user.name)

  return (
    <div className="min-h-svh bg-transparent text-foreground">
      <header className="px-4 pt-3 md:px-6">
        <div className="mx-auto flex max-w-6xl items-center px-0 py-1 md:py-2">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="shrink-0 rounded-full border border-white/10 bg-white/5 p-[2px]">
              <ProfileAvatar
                name={user.name}
                image={user.image}
                className="size-10 rounded-full border-white/0 bg-[#f6d692] text-[#1d1d1f] md:size-11"
              />
            </div>
            <div className="min-w-0">
              <p className="text-[0.95rem] leading-none font-medium tracking-[-0.03em] text-white/50 md:text-[1.05rem]">
                hello,
              </p>
              <p className="truncate pt-0.5 text-[1.25rem] leading-none font-semibold tracking-[-0.04em] text-white md:text-[1.45rem]">
                {greetingName}
              </p>
            </div>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl overflow-x-hidden px-4 pb-36 pt-6 [--page-gutter:1rem] md:px-6 md:pb-40 md:pt-8 md:[--page-gutter:1.5rem]">
        {children}
      </main>
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50">
        <div className="pointer-events-auto">
          <BackfillStatusBanner
            initialRunning={backfillRunning}
            forceVisible
          />
          <BottomTabBar reviewAttentionCount={reviewAttentionCount} />
        </div>
      </div>
    </div>
  )
}
