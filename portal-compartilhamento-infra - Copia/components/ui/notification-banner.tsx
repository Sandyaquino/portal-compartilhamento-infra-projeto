export type Notification = {
  type: "success" | "error" | "warning" | "info"
  message: string
}

const STYLES_BY_TYPE: Record<Notification["type"], string> = {
  success: "border-green-200 bg-green-50 text-green-700",
  error: "border-red-200 bg-red-50 text-red-700",
  warning: "border-amber-200 bg-amber-50 text-amber-700",
  info: "border-slate-200 bg-slate-50 text-slate-700",
}

type NotificationBannerProps = {
  notification: Notification | null
  className?: string
}

export function NotificationBanner({ notification, className }: NotificationBannerProps) {
  if (!notification) return null

  return (
    <div
      className={`rounded-xl border p-4 text-sm font-medium shadow-sm ${STYLES_BY_TYPE[notification.type]} ${className ?? ""}`}
    >
      {notification.message}
    </div>
  )
}
