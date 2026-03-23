import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@workspace/ui/lib/utils"

const cardVariants = cva(
  "relative overflow-hidden rounded-xl border border-white/8 bg-[rgba(15,15,16,0.94)] text-card-foreground shadow-[0_16px_48px_rgba(0,0,0,0.35)]",
  {
    variants: {
      variant: {
        default: "",
        cream: "bg-[var(--neo-cream)] text-[var(--neo-black)] border-black/12",
        spotlight:
          "bg-[var(--neo-blue)] text-white border-[rgba(87,126,255,0.46)] shadow-[0_16px_48px_rgba(0,0,0,0.35),0_10px_0_var(--neo-shadow-blue)]",
      },
      inset: {
        default: "",
        grid: "",
      },
    },
    defaultVariants: {
      variant: "default",
      inset: "default",
    },
  },
)

function Card({
  className,
  variant,
  inset,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof cardVariants>) {
  return <div data-slot="card" className={cn(cardVariants({ variant, inset, className }))} {...props} />
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-header" className={cn("relative flex flex-col gap-2 p-5 md:p-6", className)} {...props} />
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-title" className={cn("text-lg font-semibold tracking-tight", className)} {...props} />
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-description" className={cn("text-sm text-muted-foreground", className)} {...props} />
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-content" className={cn("relative p-5 pt-0 md:p-6 md:pt-0", className)} {...props} />
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-footer" className={cn("relative flex items-center gap-3 p-5 pt-0 md:p-6 md:pt-0", className)} {...props} />
}

export { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle }
