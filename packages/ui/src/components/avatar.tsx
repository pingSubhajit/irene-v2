"use client"

import * as React from "react"

import { cn } from "@workspace/ui/lib/utils"

function Avatar({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="avatar"
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden border border-white/10 bg-[rgba(22,22,24,0.96)] text-white",
        className,
      )}
      {...props}
    />
  )
}

function AvatarImage({
  className,
  alt = "",
  ...props
}: React.ComponentProps<"img">) {
  return (
    <img
      data-slot="avatar-image"
      alt={alt}
      className={cn("h-full w-full object-cover", className)}
      {...props}
    />
  )
}

function AvatarFallback({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="avatar-fallback"
      className={cn(
        "flex h-full w-full items-center justify-center bg-[linear-gradient(135deg,rgba(255,255,255,0.14),rgba(255,255,255,0.04))] text-sm font-semibold uppercase tracking-[0.24em] text-white/84",
        className,
      )}
      {...props}
    />
  )
}

export { Avatar, AvatarFallback, AvatarImage }
