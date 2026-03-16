import * as React from "react"

import { cn } from "@workspace/ui/lib/utils"

function Select({ className, children, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      data-slot="select"
      className={cn(
        "flex h-12 w-full appearance-none border border-white/10 bg-[rgba(20,20,22,0.92)] px-4 text-sm text-[var(--neo-cream)] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] transition-colors outline-none focus:border-[var(--neo-yellow)] disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  )
}

export { Select }
