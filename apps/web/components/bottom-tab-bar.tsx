"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

import {
  RiExchangeDollarLine,
  RiHome5Line,
  RiSearchEyeLine,
  RiSettings3Line,
} from "@remixicon/react"
import { cn } from "@workspace/ui/lib/utils"

const tabs = [
  { href: "/dashboard", label: "Home", icon: RiHome5Line },
  { href: "/activity", label: "Activity", icon: RiExchangeDollarLine },
  { href: "/review", label: "Review", icon: RiSearchEyeLine },
  { href: "/settings", label: "Settings", icon: RiSettings3Line },
]

export function BottomTabBar() {
  const pathname = usePathname()

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 px-4 pb-4 md:px-6">
      <div className="neo-shell mx-auto flex max-w-md items-center justify-between border border-white/8 px-3 py-2 shadow-[0_20px_60px_rgba(0,0,0,0.52)] md:max-w-3xl">
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
                "relative flex min-w-[68px] flex-1 flex-col items-center gap-1 px-2 py-2 text-[0.68rem] font-medium uppercase tracking-[0.22em] text-white/38 transition",
                active && "text-white",
              )}
            >
              <span
                className={cn(
                  "absolute inset-x-2 top-0 h-px bg-transparent transition",
                  active && "bg-[var(--neo-yellow)] shadow-[0_0_18px_rgba(255,231,90,0.7)]",
                )}
              />
              <span
                className={cn(
                  "flex size-10 items-center justify-center border border-transparent transition",
                  active &&
                    "border-white/10 bg-white/6 shadow-[0_0_30px_rgba(255,255,255,0.06)]",
                )}
              >
                <Icon className="size-5" />
              </span>
              <span>{tab.label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
