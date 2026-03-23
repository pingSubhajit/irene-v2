"use client"

import * as React from "react"

import { cn } from "@workspace/ui/lib/utils"

function Empty({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="empty"
      className={cn(
        "flex w-full flex-col items-center justify-center text-center",
        className,
      )}
      {...props}
    />
  )
}

function EmptyMedia({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="empty-media"
      className={cn("flex items-center justify-center", className)}
      {...props}
    />
  )
}

function EmptyHeader({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="empty-header"
      className={cn("grid justify-items-center gap-3", className)}
      {...props}
    />
  )
}

function EmptyTitle({
  className,
  ...props
}: React.ComponentProps<"h3">) {
  return (
    <h3
      data-slot="empty-title"
      className={cn("text-base font-medium tracking-[-0.02em]", className)}
      {...props}
    />
  )
}

function EmptyDescription({
  className,
  ...props
}: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="empty-description"
      className={cn("max-w-[32ch] text-sm leading-6", className)}
      {...props}
    />
  )
}

function EmptyFooter({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="empty-footer"
      className={cn("mt-2 flex items-center justify-center gap-3", className)}
      {...props}
    />
  )
}

export {
  Empty,
  EmptyDescription,
  EmptyFooter,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
}
