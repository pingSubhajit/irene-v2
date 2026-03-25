"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

import { ArrowsLeftRight, Gear, House, Binoculars } from "@phosphor-icons/react"
import { cn } from "@workspace/ui/lib/utils"

const tabs = [
  { href: "/dashboard", label: "Home", icon: House },
  { href: "/activity", label: "Activity", icon: ArrowsLeftRight },
  { href: "/review", label: "Review", icon: Binoculars },
  { href: "/settings", label: "Settings", icon: Gear },
]

export function BottomTabBar({
  reviewAttentionCount = 0,
}: {
  reviewAttentionCount?: number
}) {
  const pathname = usePathname()

  return (
    <nav className="border-t border-white/8 bg-[rgba(10,10,12,0.8)] pb-[max(0.25rem,env(safe-area-inset-bottom))] backdrop-blur-2xl">
      <div className="mx-auto max-w-md md:max-w-3xl">
        <div className="mt-[-1px] flex items-center justify-between px-5 md:px-7">
          {tabs.map((tab) => {
            const Icon = tab.icon
            const active =
              pathname === tab.href ||
              (tab.href === "/activity" && pathname === "/ledger")

            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={cn(
                  "relative flex min-w-[56px] flex-1 items-center justify-center px-2 py-3 text-white/34 transition hover:text-white/68",
                  active && "text-white"
                )}
                aria-label={tab.label}
              >
                <span
                  className={cn(
                    "absolute inset-x-3 top-0 h-[2px] rounded-full bg-transparent transition",
                    active &&
                      "bg-[var(--neo-yellow)] shadow-[0_0_18px_rgba(255,231,90,0.7)]"
                  )}
                />
                <span className="sr-only">{tab.label}</span>
                <span className="relative flex size-11 items-center justify-center">
                  <Icon className="size-[1.9rem]" weight="fill" />
                  {tab.href === "/review" && reviewAttentionCount > 0 ? (
                    <span className="absolute top-0.5 right-0.5 min-w-[1rem] rounded-full bg-[var(--neo-coral)] px-1 py-[1px] text-center text-[0.5rem] leading-none font-semibold tracking-normal text-black shadow-[0_0_18px_rgba(255,122,92,0.36)]">
                      {reviewAttentionCount > 9 ? "9+" : reviewAttentionCount}
                    </span>
                  ) : null}
                </span>
              </Link>
            )
          })}
        </div>
      </div>
    </nav>
  )
}
