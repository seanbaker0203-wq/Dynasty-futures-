/**
 * Small fetch helpers with timeouts. TLS verification is always on.
 */
const UA = 'DynastyFutures/0.1 (+https://github.com/)';

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function fetchResponse(
  url: string,
  init: RequestInit & { timeoutMs?: number } = {}
): Promise<Response> {
  const { timeoutMs = 20000, headers, ...rest } = init;
  const res = await fetch(url, {
    ...rest,
    headers: { 'User-Agent': UA, ...(headers as Record<string, string>) },
    signal: AbortSignal.timeout(timeoutMs),
  });
  return res;
}

export async function fetchText(url: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<string> {
  const res = await fetchResponse(url, init);
  if (!res.ok) throw new HttpError(res.status, `${res.status} from ${new URL(url).host}`);
  return res.text();
}

export async function fetchJson<T = any>(url: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<T> {
  const text = await fetchText(url, init);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new HttpError(502, `Unexpected non-JSON response from ${new URL(url).host}`);
  }
}
