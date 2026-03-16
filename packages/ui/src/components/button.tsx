"use client"

import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@workspace/ui/lib/utils"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center gap-2 rounded-none border bg-clip-padding text-sm font-semibold whitespace-nowrap transition-all outline-none select-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-0 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "neo-btn-3d neo-btn-3d-cream border-[rgba(255,255,255,0.12)] bg-[var(--neo-cream)] text-[var(--neo-black)]",
        outline:
          "neo-btn-3d neo-btn-3d-dark border-white/12 bg-[rgba(24,24,26,0.92)] text-[var(--neo-cream)] hover:bg-[rgba(32,32,36,0.98)]",
        secondary:
          "neo-btn-3d neo-btn-3d-yellow border-[rgba(255,231,90,0.35)] bg-[var(--neo-yellow)] text-[var(--neo-black)]",
        ghost:
          "border-transparent bg-transparent text-white/72 shadow-none hover:border-white/10 hover:bg-white/6 hover:text-white active:translate-y-px",
        destructive:
          "neo-btn-3d neo-btn-3d-coral border-[rgba(255,126,99,0.34)] bg-[var(--neo-coral)] text-[var(--neo-black)]",
        link: "border-transparent bg-transparent p-0 text-[var(--neo-cream)] underline-offset-4 shadow-none hover:underline active:translate-y-0",
      },
      size: {
        default:
          "h-12 px-5 has-data-[icon=inline-end]:pr-4 has-data-[icon=inline-start]:pl-4",
        xs: "h-8 px-3 text-[0.72rem] [&_svg:not([class*='size-'])]:size-3",
        sm: "h-10 px-4 text-sm",
        lg: "h-14 px-6 text-base",
        icon: "size-12",
        "icon-xs":
          "size-8 [&_svg:not([class*='size-'])]:size-3",
        "icon-sm":
          "size-10",
        "icon-lg": "size-14",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
