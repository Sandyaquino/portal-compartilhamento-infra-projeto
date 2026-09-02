// Sentry (error tracking) do lado do cliente.
// Fica inativo até NEXT_PUBLIC_SENTRY_DSN ser definido no .env.
// Ver instrumentation.ts para o lado servidor e README para ativação.
if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  import("@sentry/nextjs").then(({ init }) => {
    init({
      dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
      environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? "development",
      tracesSampleRate: 0.1,
    });
  });
}

export function onRouterTransitionStart(
  url: string,
  navigationType: "push" | "replace" | "traverse"
) {
  if (!process.env.NEXT_PUBLIC_SENTRY_DSN) return;
  import("@sentry/nextjs").then(({ addBreadcrumb }) => {
    addBreadcrumb({ category: "navigation", message: `${navigationType} ${url}` });
  });
}
