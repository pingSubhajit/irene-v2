import * as React from "react"

import { cn } from "@workspace/ui/lib/utils"

function ScrollArea({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="scroll-area"
      className={cn("neo-scrollbar overflow-auto", className)}
      {...props}
    />
  )
}

export { ScrollArea }
