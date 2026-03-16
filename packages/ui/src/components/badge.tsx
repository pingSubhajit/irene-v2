import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@workspace/ui/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center justify-center border px-2.5 py-1 text-[0.67rem] font-semibold uppercase tracking-[0.24em]",
  {
    variants: {
      variant: {
        default: "border-white/10 bg-white/6 text-white/72",
        success: "border-emerald-400/24 bg-emerald-400/10 text-[var(--neo-green)]",
        warning: "border-amber-300/24 bg-amber-300/10 text-[var(--neo-yellow)]",
        danger: "border-orange-400/24 bg-orange-400/10 text-[var(--neo-coral)]",
        cream: "border-black/12 bg-[var(--neo-cream)] text-[var(--neo-black)]",
        violet: "border-violet-400/24 bg-violet-400/12 text-[#b6a8ff]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
)

function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span data-slot="badge" className={cn(badgeVariants({ variant, className }))} {...props} />
}

export { Badge, badgeVariants }
