"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  BarChart3,
  FileText,
  ShieldCheck,
  Zap,
} from "lucide-react";

import { API_BASE_URL } from "@/lib/config";
import { NotificationBanner } from "@/components/ui/notification-banner";
import { Button } from "@/components/ui/button";

const DESTAQUES = [
  {
    icon: FileText,
    titulo: "Gestão de Contratos",
    descricao: "Provedores, processos e faturamento em um só lugar.",
  },
  {
    icon: BarChart3,
    titulo: "Indicadores em Tempo Real",
    descricao: "Acompanhamento operacional diário das equipes.",
  },
  {
    icon: ShieldCheck,
    titulo: "Acesso Seguro",
    descricao: "Autenticação por código de verificação enviado por e-mail.",
  },
];

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState("");

  async function enviarCodigo() {
    try {
      setErro("");

      if (!email) {
        setErro("Informe um e-mail válido.");
        return;
      }

      setLoading(true);

      const response = await fetch(
        `${API_BASE_URL}/auth/enviar-codigo`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.detail || "Erro ao enviar código."
        );
      }

      localStorage.setItem(
        "email_login",
        email
      );

      const query = new URLSearchParams({ email });

      // Apenas para ambiente de desenvolvimento (PORTAL_AUTH_DEV_MODE=S):
      // a tela de validação exibe esse código inline em vez de um alert().
      if (data.codigo_teste) {
        query.set("codigo_teste", data.codigo_teste);
      }

      router.push(`/validar-codigo?${query.toString()}`);

    } catch (error: any) {
      setErro(
        error.message || "Erro ao enviar código."
      );
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      enviarCodigo();
    }
  }

  return (
    <div className="grid min-h-screen grid-cols-1 lg:grid-cols-5">
      {/* Painel de marca */}
      <div className="relative hidden overflow-hidden bg-[#04331F] lg:col-span-2 lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, #FFFFFF 1px, transparent 0)",
            backgroundSize: "28px 28px",
          }}
        />
        <div className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-[#7CC142] opacity-20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-16 h-72 w-72 rounded-full bg-[#005A34] opacity-40 blur-3xl" />

        <div className="relative flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#7CC142] shadow-lg">
            <Zap className="h-6 w-6 text-white" />
          </div>
          <div>
            <p className="text-sm font-bold tracking-widest text-white">
              NEOENERGIA
            </p>
            <p className="text-xs text-emerald-200/80">Coelba</p>
          </div>
        </div>

        <div className="relative">
          <h1 className="text-4xl font-bold leading-tight text-white">
            Portal de Compartilhamento
            <br />
            de Infraestrutura
          </h1>

          <p className="mt-4 max-w-md text-sm leading-relaxed text-emerald-100/80">
            Gestão centralizada de contratos, faturamento e fiscalização
            do compartilhamento de postes.
          </p>

          <div className="mt-10 space-y-5">
            {DESTAQUES.map((item) => (
              <div key={item.titulo} className="flex items-start gap-3">
                <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/10">
                  <item.icon className="h-4.5 w-4.5 text-[#7CC142]" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">
                    {item.titulo}
                  </p>
                  <p className="text-xs text-emerald-100/70">
                    {item.descricao}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="relative text-xs text-emerald-200/60">
          © 2026 Neoenergia Coelba — Todos os direitos reservados.
        </p>
      </div>

      {/* Painel de acesso */}
      <div className="flex flex-col justify-center bg-white px-6 py-12 lg:col-span-3 lg:px-20 xl:px-28">
        <div className="mx-auto w-full max-w-sm">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#005A34]">
              <Zap className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-sm font-bold tracking-widest text-[#005A34]">
                NEOENERGIA
              </p>
              <p className="text-xs text-slate-500">Coelba</p>
            </div>
          </div>

          <p className="text-xs font-semibold uppercase tracking-wider text-[#7CC142]">
            Acesso ao portal
          </p>

          <h2 className="mt-2 text-2xl font-bold text-slate-900">
            Bem-vindo de volta
          </h2>

          <p className="mt-2 text-sm text-slate-500">
            Informe seu e-mail corporativo para receber um código de
            acesso de uso único.
          </p>

          <div className="mt-8">
            <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-slate-500">
              E-mail corporativo
            </label>

            <input
              type="email"
              value={email}
              placeholder="usuario@neoenergia.com"
              autoFocus
              onChange={(event) => setEmail(event.target.value)}
              onKeyDown={handleKeyDown}
              className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[#005A34] focus:ring-2 focus:ring-green-100"
            />
          </div>

          {erro && (
            <NotificationBanner
              className="mt-4"
              notification={{ type: "error", message: erro }}
            />
          )}

          <Button
            onClick={enviarCodigo}
            loading={loading}
            className="mt-6 h-12 w-full text-sm"
          >
            {loading ? (
              "Enviando código..."
            ) : (
              <>
                Enviar código de acesso
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </Button>

          <p className="mt-8 text-center text-xs text-slate-400">
            Portal de Compartilhamento de Infraestrutura — Neoenergia Coelba
          </p>
        </div>
      </div>
    </div>
  );
}
