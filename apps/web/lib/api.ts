// Appels à l'API (même domaine : Caddy envoie /api vers le service .NET).

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const init: RequestInit = { method, credentials: "include", headers: {} };
  if (body instanceof FormData) {
    init.body = body;
  } else if (body !== undefined) {
    (init.headers as Record<string, string>)["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }

  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    throw new ApiError(0, "Le portail est injoignable. Vérifie ta connexion.");
  }

  if (res.status === 401 && typeof window !== "undefined" && !url.startsWith("/api/me")) {
    window.location.href = `/login?retour=${encodeURIComponent(window.location.pathname)}`;
  }

  const text = await res.text();
  let json: any = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      /* corps non JSON */
    }
  }

  if (!res.ok) {
    throw new ApiError(res.status, json?.error ?? `Erreur ${res.status}`, json?.details);
  }
  return json as T;
}

export const api = {
  get: <T>(url: string) => request<T>("GET", url),
  post: <T>(url: string, body?: unknown) => request<T>("POST", url, body ?? {}),
  put: <T>(url: string, body?: unknown) => request<T>("PUT", url, body ?? {}),
  del: <T>(url: string) => request<T>("DELETE", url),
};

export async function uploadImage(file: Blob): Promise<string> {
  const fd = new FormData();
  fd.append("file", file, "image");
  const res = await request<{ id: string }>("POST", "/api/files", fd);
  return res.id;
}

export const fileUrl = (id: string) => `/api/files/${id}`;
