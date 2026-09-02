"use client"

import type { ReactNode } from "react"
import { ChevronRight, Home } from "lucide-react"
import { useRouter } from "next/navigation"

type BreadcrumbItem = {
  label: string
  href?: string
}

type PageHeaderProps = {
  title: string
  description?: string
  breadcrumbs: BreadcrumbItem[]
  actions?: ReactNode
}

export function PageHeader({
  title,
  description,
  breadcrumbs,
  actions,
}: PageHeaderProps) {
  const router = useRouter()

  return (
    <div className="space-y-5">
      <nav className="flex items-center gap-2 text-sm">
        {breadcrumbs.map((item, index) => {
          const isLast = index === breadcrumbs.length - 1

          return (
            <div
              key={item.label}
              className="flex items-center gap-2"
            >
              {index === 0 && (
                <Home className="h-4 w-4 text-primary" />
              )}

              {item.href && !isLast ? (
                <button
                  type="button"
                  onClick={() => router.push(item.href!)}
                  className="font-medium text-primary hover:underline"
                >
                  {item.label}
                </button>
              ) : (
                <span
                  className={
                    isLast
                      ? "font-medium text-slate-800"
                      : "font-medium text-primary"
                  }
                >
                  {item.label}
                </span>
              )}

              {!isLast && (
                <ChevronRight className="h-4 w-4 text-slate-400" />
              )}
            </div>
          )
        })}
      </nav>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-primary">
            {title}
          </h1>

          {description && (
            <p className="mt-2 text-base text-slate-500">
              {description}
            </p>
          )}
        </div>

        {actions && <div className="shrink-0">{actions}</div>}
      </div>
    </div>
  )
}