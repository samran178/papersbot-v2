export class ApiError extends Error {
  readonly status: number;
  readonly data: unknown;

  constructor(message: string, status: number, data: unknown) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

const readCookie = (name: string): string | undefined =>
  document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${name}=`))
    ?.split("=")[1];

let csrfReady: Promise<void> | undefined;

const ensureCsrfCookie = (): Promise<void> => {
  if (readCookie("csrftoken")) return Promise.resolve();
  csrfReady ??= fetch("/api/auth/csrf", { credentials: "same-origin" }).then(() => undefined);
  return csrfReady;
};

const messageFor = (status: number, data: unknown): string => {
  if (data && typeof data === "object" && "detail" in data && typeof data.detail === "string") return data.detail;
  if (status === 0) return "Can't reach the server. Check your internet connection.";
  if (status === 403) return "You don't have permission to do that.";
  if (status === 404) return "Not found.";
  if (status >= 500) return "Something went wrong on the server. Please try again.";
  return "Request failed.";
};

type Method = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

const request = async <T>(method: Method, path: string, body?: unknown): Promise<T> => {
  const headers: Record<string, string> = { Accept: "application/json" };
  let payload: BodyInit | undefined;

  if (method !== "GET") {
    await ensureCsrfCookie();
    headers["X-CSRFToken"] = readCookie("csrftoken") ?? "";
  }
  if (body instanceof FormData) {
    payload = body;
  } else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }

  let response: Response;
  try {
    response = await fetch(`/api${path}`, { method, headers, body: payload, credentials: "same-origin" });
  } catch {
    throw new ApiError(messageFor(0, null), 0, null);
  }

  if (response.status === 204) return undefined as T;
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(messageFor(response.status, data), response.status, data);
  return data as T;
};

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body ?? {}),
  patch: <T>(path: string, body: unknown) => request<T>("PATCH", path, body),
  delete: <T = void>(path: string) => request<T>("DELETE", path),
};

export const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : "Something went wrong.";
