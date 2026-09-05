
"use client"

import * as React from "react"
import { usePathname, useRouter } from "next/navigation"
import { useCurrentUser } from "@/hooks/use-current-user"
import { ehPerfilAdministrador } from "@/lib/admin-api"

import {
  BarChart3,
  Briefcase,
  Building2,
  Settings,
  Gauge,
  LineChart,
  FileText,
  ReceiptText,
  ClipboardCheck,
  Users,
  ShieldCheck,
  ChevronDown,
  ChevronRight,
  Zap,
  TrendingUp,
  MapPin,
  FolderKanban,
  Inbox,
  ListTodo,
  SearchCheck,
  HardHat,
  Route,
  Wallet,
  UsersRound,
  UserCog,
} from "lucide-react"

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarTrigger,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar"

const menuItems = [
  {
    title: "Caixa de Tarefas",
    url: "/tarefas",
    icon: ListTodo,
  },
  {
    title: "Resultados",
    url: "/resultados",
    icon: BarChart3,
    children: [
      {
        title: "Plano de Medidas",
        url: "/resultados/planodemedidas",
        icon: Gauge,
      },
      {
        title: "KPIs Mensais",
        url: "/resultados/kpismensal",
        icon: TrendingUp,
      },
      {
        title: "Resultados de Execução",
        url: "/resultados/resultadoexecucao",
        icon: LineChart,
      },
      {
        title: "Resultados Financeiros",
        url: "/resultados/resultadofinanceiro",
        icon: BarChart3,
      },
    ],
  },
  {
    title: "Comercial",
    url: "/comercial",
    icon: Briefcase,
    children: [

      {
        title: "Jornada de Entrantes",
        url: "/comercial/novosentrantes",
        icon: FileText,
      },
      {
        title: "Carteira de Análise",
        url: "/comercial/carteira-analise",
        icon: Users,
      },
      {
        title: "Processos",
        url: "/comercial/processos",
        icon: ClipboardCheck,
      },
      {
        title: "Contratos",
        url: "/comercial/contratos",
        icon: FileText,
      },
      {
        title: "Faturamento",
        url: "/comercial/faturamento",
        icon: ReceiptText,
      },
      {
        title: "Cadastro Forms",
        url: "/comercial/cadastroforms",
        icon: ReceiptText,
      },
    ],
  },
  {
    title: "Projetos",
    url: "/projetos",
    icon: FolderKanban,
    children: [
      {
        title: "Carteira de Projetos",
        url: "/projetos",
        icon: FolderKanban,
      },
      {
        title: "Carteira de Análise",
        url: "/projetos/carteira",
        icon: ClipboardCheck,
      },
      {
        title: "Caixa de Entrada",
        url: "/projetos/entrada",
        icon: Inbox,
      },
    ],
  },
  {
    title: "Operação",
    url: "/operacao",
    icon: Building2,
    children: [
      {
        title: "Fiscalização",
        url: "/operacao/fiscalizacao",
        icon: SearchCheck,
      },
      {
        title: "Execução",
        url: "/operacao/execucao",
        icon: HardHat,
      },
      {
        title: "Carteira",
        url: "/operacao/carteira",
        icon: Route,
      },
      {
        title: "Despesas",
        url: "/operacao/despesas",
        icon: Wallet,
      },
      {
        title: "Cadastro de Equipes",
        url: "/operacao/cadastro_equipe",
        icon: UsersRound,
      },
      {
        title: "Cadastro de Técnicos",
        url: "/operacao/cadastro_tecnico",
        icon: UserCog,
      },
    ],
  },
  {
    title: "Mapa de Postes",
    url: "/mapa-postes",
    icon: MapPin,
  },
  {
    title: "Administração",
    url: "/administracao",
    icon: Settings,
    children: [
      {
        title: "Usuários",
        url: "/administracao/usuarios",
        icon: Users,
      },
      {
        title: "Perfis",
        url: "/administracao/perfis",
        icon: ShieldCheck,
      },
    ],
  },
]

function SidebarLogo() {
  const { state } = useSidebar()

  return (
    <div className="flex w-full items-center gap-3 overflow-hidden px-1">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#7CC142] shadow-sm">
        <Zap className="h-4.5 w-4.5 text-white" />
      </div>

      {state === "expanded" && (
        <div className="min-w-0 leading-tight">
          <p className="truncate text-sm font-bold tracking-wide text-white">
            NEOENERGIA
          </p>

          <p className="truncate text-xs text-emerald-200/70">
            Compartilhamento
          </p>
        </div>
      )}
    </div>
  )
}

export function AppSidebar() {
  const { state } = useSidebar()
  const pathname = usePathname()
  const router = useRouter()
  const { user } = useCurrentUser()

  const [openMenu, setOpenMenu] =
    React.useState<string | null>(null)

  const itensVisiveis = menuItems.filter(
    (item) => item.title !== "Administração" || ehPerfilAdministrador(user?.perfil),
  )

  const initials =
    user?.nome
      ?.split(" ")
      .slice(0, 2)
      .map((nome: string) => nome[0])
      .join("")
      .toUpperCase() || "US"

  function toggleMenu(title: string) {
    setOpenMenu((current) =>
      current === title ? null : title
    )
  }

  return (
    <Sidebar collapsible="icon" className="border-sidebar-border">
      <SidebarHeader className="bg-sidebar">
        <div className="flex items-center justify-between gap-2 px-1 py-3">
          <SidebarLogo />

          {state === "expanded" && (
            <SidebarTrigger className="h-7 w-7 shrink-0 rounded-md text-emerald-200/70 hover:bg-white/10 hover:text-white" />
          )}
        </div>

        {state === "collapsed" && (
          <SidebarTrigger className="mx-auto h-7 w-7 rounded-md text-emerald-200/70 hover:bg-white/10 hover:text-white" />
        )}
      </SidebarHeader>

      <SidebarContent className="bg-sidebar">
        <SidebarMenu className="gap-0.5 px-2 py-2">
          {itensVisiveis.map((item) => {
            const Icon = item.icon

            const active =
              pathname === item.url ||
              pathname.startsWith(`${item.url}/`)

            const isOpen = openMenu === item.title

            return (
              <SidebarMenuItem key={item.title}>
                <SidebarMenuButton
                  isActive={active}
                  tooltip={item.title}
                  className={`
                    h-9
                    rounded-lg
                    border-l-2
                    text-sm
                    transition-all
                    hover:bg-white/8
                    hover:text-white
                    data-active:bg-white/10
                    data-active:text-white
                    ${state === "collapsed" ? "justify-center border-l-0 px-0" : ""}
                    ${
                      active
                        ? "border-[#7CC142] text-white"
                        : "border-transparent text-emerald-100/80"
                    }
                  `}
                >
                  <span
                    role="button"
                    tabIndex={0}
                    className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5"
                    onClick={() => router.push(item.url)}
                    onKeyDown={(event) => {
                      if (
                        event.key === "Enter" ||
                        event.key === " "
                      ) {
                        router.push(item.url)
                      }
                    }}
                  >
                    <Icon
                      className={`
                        h-4
                        w-4
                        shrink-0
                        ${active ? "text-[#7CC142]" : "text-emerald-200/60"}
                        ${state === "collapsed" ? "mx-auto" : ""}
                      `}
                    />

                    {state === "expanded" && (
                      <span
                        className={
                          active
                            ? "truncate font-semibold"
                            : "truncate font-medium"
                        }
                      >
                        {item.title}
                      </span>
                    )}
                  </span>

                  {state === "expanded" && item.children && (
                    <span
                      role="button"
                      tabIndex={0}
                      className="ml-auto flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-emerald-200/60 hover:bg-white/10 hover:text-white"
                      onClick={(event) => {
                        event.stopPropagation()
                        toggleMenu(item.title)
                      }}
                      onKeyDown={(event) => {
                        if (
                          event.key === "Enter" ||
                          event.key === " "
                        ) {
                          event.stopPropagation()
                          toggleMenu(item.title)
                        }
                      }}
                    >
                      {isOpen ? (
                        <ChevronDown className="h-3.5 w-3.5" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5" />
                      )}
                    </span>
                  )}
                </SidebarMenuButton>

                {state === "expanded" &&
                  isOpen &&
                  item.children && (
                    <SidebarMenuSub className="ml-4 mt-0.5 border-l border-white/10 px-2">
                      {item.children.map((subItem) => {
                        const SubIcon = subItem.icon

                        const subActive =
                          pathname === subItem.url ||
                          pathname.startsWith(
                            `${subItem.url}/`
                          )

                        return (
                          <SidebarMenuSubItem
                            key={subItem.title}
                          >
                            <SidebarMenuSubButton
                              isActive={subActive}
                              className={`
                                h-8
                                cursor-pointer
                                rounded-md
                                text-sm
                                transition-all
                                ${
                                  subActive
                                    ? "bg-white/10 font-semibold text-white"
                                    : "text-emerald-100/60 hover:bg-white/8 hover:text-white"
                                }
                              `}
                              onClick={() =>
                                router.push(subItem.url)
                              }
                            >
                              <SubIcon
                                className={
                                  subActive
                                    ? "h-3.5 w-3.5 text-[#7CC142]"
                                    : "h-3.5 w-3.5 text-emerald-200/50"
                                }
                              />

                              <span>{subItem.title}</span>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )
                      })}
                    </SidebarMenuSub>
                  )}
              </SidebarMenuItem>
            )
          })}
        </SidebarMenu>
      </SidebarContent>

      <SidebarFooter className="bg-sidebar border-t border-white/10">
        {state === "expanded" ? (
          <div className="flex w-full items-center gap-2.5 overflow-hidden p-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#7CC142] text-xs font-bold text-white">
              {initials}
            </div>

            <div className="min-w-0 flex-1 leading-tight">
              <p className="max-w-[130px] truncate text-sm font-semibold text-white">
                {user?.nome || "Carregando usuário..."}
              </p>

              <p className="max-w-[130px] truncate text-xs text-emerald-200/60">
                {user?.perfil || ""}
              </p>
            </div>
          </div>
        ) : (
          <div className="flex justify-center p-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#7CC142] text-xs font-bold text-white">
              {initials}
            </div>
          </div>
        )}
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  )
}
