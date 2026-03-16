import * as React from "react"

import { cn } from "@workspace/ui/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "flex h-12 w-full min-w-0 border border-white/10 bg-[rgba(20,20,22,0.92)] px-4 text-sm text-[var(--neo-cream)] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] transition-colors outline-none placeholder:text-white/32 focus:border-[var(--neo-yellow)] focus:bg-[rgba(24,24,26,0.98)] focus:ring-0 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  )
}

export { Input }
