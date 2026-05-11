export const COLLAB_API_URL = typeof window !== "undefined"
  ? "http://localhost:4000"
  : (process.env.COLLAB_API_URL ?? "http://localhost:4000");

export async function getAuthToken(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("auth_token");
}

export async function setAuthToken(token: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem("auth_token", token);
}

export async function clearAuthToken() {
  if (typeof window === "undefined") return;
  localStorage.removeItem("auth_token");
}

export async function collabFetch<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = await getAuthToken();
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...options.headers,
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${COLLAB_API_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${res.status}: ${text}`);
  }

  return res.json();
}
