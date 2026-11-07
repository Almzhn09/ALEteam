import type { ApiErrorBody } from '@/contracts/api';
import { mockFetch, mockFileUrl } from './mock';

// Mock mode is a development aid only: the banner in the layout makes it visible.
export const MOCK_MODE = process.env.NEXT_PUBLIC_API_MOCK === '1';

export class ApiClientError extends Error {
  constructor(public status: number, public code: string, message: string,
    public retryAfter?: number, public fields?: { path: string; code: string }[]) { super(message); }
  get network() { return this.status === 0; }
}

const fallback: Record<number, string> = {
  0: 'Нет соединения с сервером. Проверьте сеть и повторите.',
  400: 'Проверьте введённые данные.',
  401: 'Войдите в систему, чтобы продолжить.',
  403: 'Недостаточно прав для этого действия.',
  404: 'Материал не найден или недоступен.',
  409: 'Данные изменились. Обновите страницу и повторите.',
  413: 'Слишком большой запрос.',
  429: 'Слишком много запросов. Повторите позже.',
  502: 'Сервис вернул ответ, не прошедший проверку.',
  503: 'Сервис временно недоступен.',
};

async function request(path: string, init: RequestInit): Promise<Response> {
  const url = `/api${path}`;
  try {
    return MOCK_MODE ? await mockFetch(url, init) : await fetch(url, { ...init, credentials: 'same-origin', cache: 'no-store' });
  } catch (error) {
    if ((error as Error)?.name === 'AbortError') throw error;
    throw new ApiClientError(0, 'NETWORK_ERROR', fallback[0]);
  }
}

async function parse<T>(response: Response): Promise<T> {
  let body: unknown = null;
  try { body = await response.json(); } catch { /* empty or non-JSON body */ }
  if (response.ok) return body as T;
  // Two error shapes: archive API {error:{...}} and Better Auth {code,message}.
  const apiError = (body as ApiErrorBody | null)?.error;
  const authError = body as { code?: string; message?: string } | null;
  const code = apiError?.code ?? authError?.code ?? `HTTP_${response.status}`;
  const retry = Number(response.headers.get('Retry-After')) || undefined;
  const message = apiError?.message ?? authError?.message ?? fallback[response.status] ?? 'Не удалось выполнить запрос.';
  throw new ApiClientError(response.status, code, message, retry, apiError?.fields);
}

export async function apiGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  return parse<T>(await request(path, { method: 'GET', signal }));
}

export async function apiSend<T>(path: string, method: 'POST' | 'PATCH', body: unknown, headers: Record<string, string> = {}): Promise<T> {
  return parse<T>(await request(path, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) }));
}

export function fileUrl(id: string, download = false) {
  if (MOCK_MODE) return mockFileUrl(id);
  return `/api/files/${encodeURIComponent(id)}${download ? '?download=1' : ''}`;
}

export function errorText(error: unknown): string {
  if (error instanceof ApiClientError) {
    if (error.status === 429 && error.retryAfter) return `${error.message} Повторите через ${formatWait(error.retryAfter)}.`;
    return error.message;
  }
  return 'Непредвиденная ошибка. Повторите попытку.';
}

function formatWait(seconds: number) {
  if (seconds < 60) return `${seconds} с`;
  if (seconds < 3600) return `${Math.ceil(seconds / 60)} мин`;
  return `${Math.ceil(seconds / 3600)} ч`;
}
