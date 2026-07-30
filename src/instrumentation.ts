// Ghi log LỖI SERVER với digest — để khi production hiện thông báo chung chung
// ("An error occurred in the Server Components render… digest: 1234567890") thì
// ta tra được stack trace thật trong log server / Vercel Functions theo digest.
export async function onRequestError(
  err: unknown,
  request: { path?: string; method?: string },
  context: { routerKind?: string; routePath?: string }
) {
  const e = err as { digest?: string; message?: string; stack?: string };
  console.error(
    `[onRequestError] digest=${e?.digest ?? "-"} ${request?.method ?? ""} ${request?.path ?? ""}` +
      ` (${context?.routerKind ?? ""} ${context?.routePath ?? ""})\n`,
    e?.stack || e?.message || err
  );
}

export function register() {
  /* no-op: cần khai báo để Next nạp file instrumentation. */
}
