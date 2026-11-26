export async function call<T = unknown>(
  method: string,
  url: string,
): Promise<T> {
  const res = await fetch(url, { method });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || res.statusText);
  return body as T;
}
