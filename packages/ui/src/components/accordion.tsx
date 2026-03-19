"use client"

import * as React from "react"
import { RiAddLine, RiSubtractLine } from "@remixicon/react"

import { cn } from "@workspace/ui/lib/utils"

type AccordionContextValue = {
  type: "single" | "multiple"
  value: string[]
  toggleItem: (itemValue: string) => void
}

const AccordionContext = React.createContext<AccordionContextValue | null>(null)

function useAccordionContext() {
  const context = React.useContext(AccordionContext)

  if (!context) {
    throw new Error("Accordion components must be used within Accordion")
  }

  return context
}

type AccordionProps = React.ComponentProps<"div"> & {
  type?: "single" | "multiple"
  defaultValue?: string | string[]
  collapsible?: boolean
}

function Accordion({
  className,
  type = "single",
  defaultValue,
  collapsible = true,
  ...props
}: AccordionProps) {
  const initialValue = React.useMemo(() => {
    if (Array.isArray(defaultValue)) {
      return defaultValue
    }

    if (typeof defaultValue === "string") {
      return [defaultValue]
    }

    return []
  }, [defaultValue])

  const [value, setValue] = React.useState<string[]>(initialValue)

  const toggleItem = React.useCallback(
    (itemValue: string) => {
      setValue((currentValue) => {
        const isOpen = currentValue.includes(itemValue)

        if (type === "multiple") {
          return isOpen
            ? currentValue.filter((entry) => entry !== itemValue)
            : [...currentValue, itemValue]
        }

        if (isOpen) {
          return collapsible ? [] : currentValue
        }

        return [itemValue]
      })
    },
    [collapsible, type],
  )

  return (
    <AccordionContext.Provider value={{ type, value, toggleItem }}>
      <div data-slot="accordion" className={cn("grid gap-3", className)} {...props} />
    </AccordionContext.Provider>
  )
}

const AccordionItemContext = React.createContext<{
  itemValue: string
  open: boolean
} | null>(null)

function useAccordionItemContext() {
  const context = React.useContext(AccordionItemContext)

  if (!context) {
    throw new Error("AccordionTrigger and AccordionContent must be used within AccordionItem")
  }

  return context
}

function AccordionItem({
  className,
  value,
  ...props
}: React.ComponentProps<"div"> & {
  value: string
}) {
  const accordion = useAccordionContext()
  const open = accordion.value.includes(value)

  return (
    <AccordionItemContext.Provider value={{ itemValue: value, open }}>
      <div
        data-slot="accordion-item"
        className={cn("overflow-hidden border border-white/8 bg-[rgba(18,18,20,0.94)]", className)}
        {...props}
      />
    </AccordionItemContext.Provider>
  )
}

function AccordionTrigger({
  className,
  children,
  ...props
}: React.ComponentProps<"button">) {
  const accordion = useAccordionContext()
  const { itemValue, open } = useAccordionItemContext()

  return (
    <button
      data-slot="accordion-trigger"
      type="button"
      aria-expanded={open}
      className={cn(
        "flex w-full items-center justify-between gap-4 px-4 py-4 text-left transition hover:bg-white/[0.03]",
        className,
      )}
      onClick={() => accordion.toggleItem(itemValue)}
      {...props}
    >
      <span className="min-w-0 flex-1">{children}</span>
      <span className="flex size-10 shrink-0 items-center justify-center border border-white/10 bg-white/4 text-white/70">
        {open ? <RiSubtractLine className="size-4" /> : <RiAddLine className="size-4" />}
      </span>
    </button>
  )
}

function AccordionContent({
  className,
  children,
  ...props
}: React.ComponentProps<"div">) {
  const { open } = useAccordionItemContext()

  if (!open) {
    return null
  }

  return (
    <div
      data-slot="accordion-content"
      className={cn("border-t border-white/8 px-4 py-4", className)}
      {...props}
    >
      {children}
    </div>
  )
}

export { Accordion, AccordionContent, AccordionItem, AccordionTrigger }
