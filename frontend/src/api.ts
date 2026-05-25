export type ApiConfigEnv = {
  VITE_API_BASE_URL?: string;
  [key: string]: unknown;
};

export type ApiErrorDetails = {
  status: number;
  statusText: string;
  body: string;
};

export function getApiBaseUrl(env: ApiConfigEnv = import.meta.env): string {
  const configuredUrl = env.VITE_API_BASE_URL?.trim();
  if (!configuredUrl) {
    return "";
  }

  return configuredUrl.replace(/\/+$/, "");
}

export function apiUrl(path: string, baseUrl = getApiBaseUrl()): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${baseUrl}${normalizedPath}`;
}

export async function readErrorDetails(response: Response): Promise<ApiErrorDetails> {
  const contentType = response.headers.get("content-type") ?? "";
  let body = "";

  if (contentType.includes("application/json")) {
    const payload = (await response.json()) as unknown;
    body = JSON.stringify(payload, null, 2);
  } else {
    body = await response.text();
  }

  return {
    status: response.status,
    statusText: response.statusText,
    body: body || "No response body"
  };
}

export function formatApiError(action: string, details: ApiErrorDetails): string {
  return `${action} failed with HTTP ${details.status} ${details.statusText}: ${details.body}`;
}
