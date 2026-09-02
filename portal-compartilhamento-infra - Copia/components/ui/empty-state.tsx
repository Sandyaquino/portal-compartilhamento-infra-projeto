import * as React from "react"
import { Inbox } from "lucide-react"

import { cn } from "@/lib/utils"

function EmptyState({
  message = "Nenhum registro encontrado.",
  icon: Icon = Inbox,
  action,
  className,
}: {
  message?: string
  icon?: React.ElementType
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div
      data-slot="empty-state"
      className={cn("flex flex-col items-center gap-2 py-10 text-center", className)}
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
        <Icon className="h-5 w-5 text-muted-foreground" />
      </div>
      <p className="text-sm text-muted-foreground">{message}</p>
      {action}
    </div>
  )
}

export { EmptyState }
