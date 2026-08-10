export type ApiResult<T = unknown> = { ok: true; data: T } | { ok: false; error: string };

export async function apiRequest<T = unknown>(
  url: string,
  method: string,
  body?: unknown
): Promise<ApiResult<T>> {
  try {
    const res = await fetch(url, {
      method,
      headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, error: data?.error ?? `Erro ${res.status}. Tente novamente.` };
    }
    return { ok: true, data };
  } catch {
    return { ok: false, error: "Falha de conexão. Verifique sua internet e tente novamente." };
  }
}
