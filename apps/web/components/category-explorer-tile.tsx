import React from "react"
import Link from "next/link"
import { RiApps2Line, RiArrowRightUpLine } from "@remixicon/react"
import { cn } from "@workspace/ui/lib/utils"
import type {
  CategoryColorToken,
  CategoryIconName,
} from "@workspace/config/category-presentation"

import {
  resolveCategoryIconComponent,
  resolveCategoryBadgeToneClassName,
} from "@/components/category-badge"

type CategoryTileProps = {
  href: string
  label: string
  amountLabel?: string | null
  iconName?: CategoryIconName | null
  colorToken?: CategoryColorToken | null
  variant?: "rail" | "grid"
  isViewAll?: boolean
}

function getSurfaceAccent(colorToken: CategoryColorToken | null | undefined) {
  switch (colorToken) {
    case "yellow":
      return {
        glow: "rgba(255,233,77,0.14)",
        ring: "rgba(255,233,77,0.22)",
      }
    case "green":
      return {
        glow: "rgba(77,255,184,0.12)",
        ring: "rgba(77,255,184,0.2)",
      }
    case "violet":
      return {
        glow: "rgba(156,107,255,0.12)",
        ring: "rgba(156,107,255,0.2)",
      }
    case "blue":
      return {
        glow: "rgba(83,183,255,0.12)",
        ring: "rgba(83,183,255,0.2)",
      }
    case "coral":
      return {
        glow: "rgba(255,122,92,0.12)",
        ring: "rgba(255,122,92,0.2)",
      }
    case "graphite":
      return {
        glow: "rgba(199,210,255,0.12)",
        ring: "rgba(199,210,255,0.18)",
      }
    case "cream":
    default:
      return {
        glow: "rgba(255,241,168,0.1)",
        ring: "rgba(255,255,255,0.08)",
      }
  }
}

export function CategoryExplorerTile({
  href,
  label,
  amountLabel,
  iconName,
  colorToken,
  variant = "rail",
  isViewAll = false,
}: CategoryTileProps) {
  const accent = getSurfaceAccent(colorToken)
  const Icon = isViewAll ? RiApps2Line : resolveCategoryIconComponent(iconName)

  return (
    <Link
      href={href}
      className={cn(
        "group text-white",
        variant === "rail"
          ? "grid w-[5rem] shrink-0 snap-start justify-items-center text-center"
          : "block w-full text-center",
      )}
    >
      <div
        className={cn(
          "relative overflow-hidden border border-white/[0.06] bg-[#121214] shadow-[0_18px_44px_rgba(0,0,0,0.22)] transition duration-300 group-hover:border-white/[0.12] group-hover:bg-[#17171a]",
          variant === "rail"
            ? "mx-auto flex aspect-square w-[4.5rem] items-center justify-center rounded-full border-white/[0.06] bg-[#18181b] shadow-none"
            : "flex aspect-square w-full items-center justify-center rounded-[1.9rem]",
        )}
        style={{
          boxShadow:
            variant === "rail"
              ? "inset 0 1px 0 rgba(255,255,255,0.07), inset 0 0 0 2.25px rgba(255,255,255,0.085), 0 0 0 1px rgba(255,255,255,0.02)"
              : `0 0 0 1px ${accent.ring} inset, 0 18px 44px rgba(0,0,0,0.22)`,
        }}
      >
        {variant === "rail" ? (
          <>
            <div className="pointer-events-none absolute inset-[2.25px] rounded-full bg-[linear-gradient(180deg,rgba(22,22,24,0.98)_0%,rgba(28,28,31,0.98)_62%,rgba(35,35,39,0.98)_100%)]" />
            <div className="pointer-events-none absolute inset-x-[16%] bottom-[10%] h-[38%] rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.055),transparent_72%)] blur-xl" />
          </>
        ) : (
          <div
            className="pointer-events-none absolute inset-x-[18%] top-[18%] h-[44%] rounded-full blur-2xl"
            style={{
              background: `radial-gradient(circle, ${accent.glow}, transparent 72%)`,
            }}
          />
        )}
        <div className="relative flex items-center justify-center">
          {variant === "rail" ? null : (
            <div className="absolute size-[4.5rem] rounded-full bg-white/[0.03] ring-1 ring-white/[0.04]" />
          )}
          {React.createElement(Icon, {
            className: cn(
              "relative z-10",
              isViewAll
                ? variant === "rail"
                  ? "size-[1.45rem] text-white/82"
                  : "size-8 text-white/78"
                : cn(
                    variant === "rail" ? "size-[1.45rem]" : "size-8",
                    variant === "rail"
                      ? "text-white/88"
                      : resolveCategoryBadgeToneClassName(colorToken),
                  ),
            ),
          })}
        </div>
        {isViewAll ? (
          <RiArrowRightUpLine
            className={cn(
              "absolute text-white/30 transition group-hover:text-white/56",
              variant === "rail"
                ? "right-2.5 top-2.5 size-3"
                : "right-4 top-4 size-4",
            )}
          />
        ) : null}
      </div>
      <div
        className={cn(
          "w-full px-0.5",
          variant === "rail" ? "pt-2.5" : "pt-3.5",
        )}
      >
        <p
          className={cn(
            "font-medium leading-tight tracking-[-0.02em] text-white text-center",
            variant === "rail"
              ? "text-[0.8rem] leading-[1.15] text-white/94 [text-wrap:balance]"
              : "text-[1.04rem]",
          )}
        >
          {label}
        </p>
        {amountLabel && variant !== "rail" ? (
          <p className="mt-1 text-[0.74rem] uppercase tracking-[0.18em] text-white/34">
            {amountLabel}
          </p>
        ) : null}
      </div>
    </Link>
  )
}
