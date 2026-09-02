import type { Instrumentation } from "next";

// Sentry (error tracking) do lado do servidor/edge.
// Fica inativo até SENTRY_DSN ser definido no .env.
// Ver instrumentation-client.ts para o lado cliente e README para ativação.
export async function register() {
  if (!process.env.SENTRY_DSN) return;

  const Sentry = await import("@sentry/nextjs");
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.SENTRY_ENVIRONMENT ?? "development",
    tracesSampleRate: 0.1,
  });
}

export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  if (!process.env.SENTRY_DSN) return;

  const Sentry = await import("@sentry/nextjs");
  Sentry.captureRequestError(err, request, context);
};
