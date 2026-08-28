const base = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? 'http://localhost:8787';

export class AdminApiError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

export async function adminRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(`${base}${path}`, {
      ...options,
      credentials: 'include',
      signal: controller.signal,
      headers: { accept: 'application/json', ...(options.body ? { 'content-type': 'application/json' } : {}), ...options.headers },
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const failure = body as { error?: { code?: string; message?: string } };
      throw new AdminApiError(response.status, failure.error?.code ?? 'REQUEST_FAILED', failure.error?.message ?? 'Falha na solicitação');
    }
    return body as T;
  } finally { clearTimeout(timer); }
}

const body = (value: unknown) => JSON.stringify(value);
export const adminApi = {
  get: <T>(path: string) => adminRequest<T>(path),
  post: <T>(path: string, value?: unknown) => adminRequest<T>(path, { method: 'POST', body: value === undefined ? undefined : body(value) }),
  patch: <T>(path: string, value: unknown) => adminRequest<T>(path, { method: 'PATCH', body: body(value) }),
};
