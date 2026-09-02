"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  KeyRound,
  MailCheck,
  ShieldCheck,
  Zap,
} from "lucide-react";

import { API_BASE_URL } from "@/lib/config";
import { setSession } from "@/lib/session";
import { NotificationBanner } from "@/components/ui/notification-banner";
import { Button } from "@/components/ui/button";

const DESTAQUES = [
  {
    icon: MailCheck,
    titulo: "Código enviado por e-mail",
    descricao: "Verifique também a caixa de spam, se necessário.",
  },
  {
    icon: KeyRound,
    titulo: "Válido por tempo limitado",
    descricao: "O código expira após alguns minutos por segurança.",
  },
  {
    icon: ShieldCheck,
    titulo: "Sessão segura",
    descricao: "Seu acesso fica protegido por criptografia de ponta a ponta.",
  },
];

export default function ValidarCodigoPage() {
  return (
    <Suspense fallback={null}>
      <ValidarCodigoConteudo />
    </Suspense>
  );
}

function ValidarCodigoConteudo() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [email, setEmail] = useState("");
  const [codigoTeste, setCodigoTeste] = useState("");
  const [codigo, setCodigo] = useState(["", "", "", "", "", ""]);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState("");

  const inputsRef = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    const emailParam =
      searchParams.get("email") ||
      localStorage.getItem("email_login") ||
      "";

    setEmail(emailParam);
    setCodigoTeste(searchParams.get("codigo_teste") || "");

    if (!emailParam) {
      router.push("/login");
    }
  }, [searchParams, router]);

  function handleChange(index: number, value: string) {
    if (!/^\d*$/.test(value)) return;

    const novoCodigo = [...codigo];
    novoCodigo[index] = value.slice(-1);
    setCodigo(novoCodigo);

    if (value && index < 5) {
      inputsRef.current[index + 1]?.focus();
    }
  }

  function handleKeyDown(
    index: number,
    event: React.KeyboardEvent<HTMLInputElement>
  ) {
    if (event.key === "Backspace" && !codigo[index] && index > 0) {
      inputsRef.current[index - 1]?.focus();
    }
  }

  function handlePaste(event: React.ClipboardEvent<HTMLInputElement>) {
    event.preventDefault();

    const texto = event.clipboardData
      .getData("text")
      .replace(/\D/g, "")
      .slice(0, 6);

    if (!texto) return;

    const novoCodigo = ["", "", "", "", "", ""];

    texto.split("").forEach((digito, index) => {
      novoCodigo[index] = digito;
    });

    setCodigo(novoCodigo);

    const proximoIndex = Math.min(texto.length, 5);
    inputsRef.current[proximoIndex]?.focus();
  }

  async function validarCodigo() {
    try {
      setErro("");

      const codigoCompleto = codigo.join("");

      if (codigoCompleto.length !== 6) {
        setErro("Informe o código completo de 6 dígitos.");
        return;
      }

      if (!email) {
        setErro("E-mail não encontrado. Volte para a tela de login.");
        return;
      }

      setLoading(true);

      const response = await fetch(`${API_BASE_URL}/auth/validar-codigo`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          codigo: codigoCompleto,
        }),
      });

      const rawText = await response.text();
      let data: any = {};

      try {
        data = rawText ? JSON.parse(rawText) : {};
      } catch {
        throw new Error(
          `Resposta inválida da API. Verifique se o FastAPI está ativo em ${API_BASE_URL}.`
        );
      }

      if (!response.ok) {
        throw new Error(data.detail || "Código inválido ou expirado.");
      }

      if (!data.token) {
        throw new Error("Token JWT não retornado pela API.");
      }

      setSession(data.token, data.usuario || {});

      router.push("/resultados");
    } catch (error: any) {
      setErro(error.message || "Erro ao validar código.");
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDownSubmit(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      validarCodigo();
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
            Verificação
            <br />
            em duas etapas
          </h1>

          <p className="mt-4 max-w-md text-sm leading-relaxed text-emerald-100/80">
            Enviamos um código de 6 dígitos para o seu e-mail. Informe-o
            para concluir o acesso ao portal.
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

      {/* Painel de validação */}
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

          <button
            type="button"
            onClick={() => router.push("/login")}
            className="mb-6 inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 transition hover:text-[#005A34]"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Usar outro e-mail
          </button>

          <p className="text-xs font-semibold uppercase tracking-wider text-[#7CC142]">
            Código de verificação
          </p>

          <h2 className="mt-2 text-2xl font-bold text-slate-900">
            Confirme seu acesso
          </h2>

          <p className="mt-2 text-sm text-slate-500">
            Digite o código de 6 dígitos enviado para{" "}
            <span className="font-semibold text-slate-700">
              {email || "seu e-mail"}
            </span>
            .
          </p>

          {codigoTeste && (
            <NotificationBanner
              className="mt-4"
              notification={{
                type: "warning",
                message: `Modo desenvolvimento — código de teste: ${codigoTeste}`,
              }}
            />
          )}

          <div className="mt-8 flex justify-between gap-2">
            {codigo.map((digito, index) => (
              <input
                key={index}
                ref={(el) => {
                  inputsRef.current[index] = el;
                }}
                type="text"
                inputMode="numeric"
                maxLength={1}
                autoFocus={index === 0}
                value={digito}
                onChange={(event) => handleChange(index, event.target.value)}
                onKeyDown={(event) => {
                  handleKeyDown(index, event);
                  handleKeyDownSubmit(event);
                }}
                onPaste={handlePaste}
                className="h-14 w-12 rounded-lg border border-slate-300 bg-white text-center text-xl font-bold text-slate-900 outline-none transition focus:border-[#005A34] focus:ring-2 focus:ring-green-100"
              />
            ))}
          </div>

          {erro && (
            <NotificationBanner
              className="mt-4"
              notification={{ type: "error", message: erro }}
            />
          )}

          <Button
            onClick={validarCodigo}
            loading={loading}
            className="mt-6 h-12 w-full text-sm"
          >
            {loading ? (
              "Validando..."
            ) : (
              <>
                Entrar
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
