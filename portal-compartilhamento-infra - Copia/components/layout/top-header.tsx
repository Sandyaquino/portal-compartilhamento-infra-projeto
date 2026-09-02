"use client"

import { useRouter } from "next/navigation"
import {
  Bell,
  ChevronDown,
  LogOut,
  UserCircle2,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu"
import { useCurrentUser } from "@/hooks/use-current-user"
import { clearSession } from "@/lib/session"

export function TopHeader() {
  const router = useRouter()
  const { user } = useCurrentUser()

  function handleLogout() {
    clearSession()
    router.push("/login")
  }

  return (
    <header className="flex h-16 items-center justify-end border-b border-slate-200 bg-white px-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="text-slate-500 hover:text-slate-700">
          <Bell className="h-5 w-5" />
        </Button>

        <div className="h-6 w-px bg-slate-200" />

        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="ghost" className="gap-2 px-2 py-1.5" />
            }
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10">
              <UserCircle2 className="h-5 w-5 text-primary" />
            </div>

            <div className="hidden text-left md:block">
              <p className="text-sm font-medium leading-tight text-slate-800">
                {user?.nome ?? "Usuário"}
              </p>
              {user?.perfil && (
                <p className="text-xs leading-tight text-slate-500">{user.perfil}</p>
              )}
            </div>

            <ChevronDown className="h-4 w-4 text-slate-400" />
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end" className="w-56">
            <div className="px-1.5 py-1.5 text-xs">
              <p className="font-medium text-slate-800">{user?.nome ?? "Usuário"}</p>
              <p className="font-normal text-slate-500">{user?.email}</p>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={handleLogout}>
              <LogOut className="h-4 w-4" />
              Sair
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
