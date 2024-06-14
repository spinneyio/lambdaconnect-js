let token: string | null = null;

export function setFetchAuthToken(newToken: string | null) {
  token = newToken;
}

export default async function authorizedFetch(
  input: RequestInfo | URL,
  init?: Omit<RequestInit, "headers"> & { headers?: Record<string, string> },
): Promise<Response> {
  const headers = init?.headers ?? {};
  if (token) {
    headers.Authorization = `Token ${token}`;
  }

  return fetch(input, {
    ...init,
    headers,
  });
}
