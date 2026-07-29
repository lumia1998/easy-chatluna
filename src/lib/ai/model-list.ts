import type { AIModelConfig } from "@/types/ai";
import { fetchThroughLocalProxy } from "@/lib/ai/local-proxy";

interface ApiErrorResponse {
  error?: { message?: string };
  message?: string;
}

interface DataModelList {
  data?: Array<{ id?: string }>;
}

interface ModelListRequest {
  url: string;
  headers: HeadersInit;
}

async function request<T>(
  url: string,
  headers: HeadersInit,
  fallback?: () => Promise<T>,
): Promise<T> {
  const response = await fetchThroughLocalProxy(url, { headers });
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    if (fallback) return fallback();
    throw new Error(`拉取模型失败：响应不是有效的 JSON（HTTP ${response.status}）`);
  }
  if (!payload || typeof payload !== "object") {
    throw new Error(`拉取模型失败：响应格式错误（HTTP ${response.status}）`);
  }

  const data = payload as T & ApiErrorResponse;
  if (!response.ok) {
    if (response.status === 404 && fallback) return fallback();
    throw new Error(
      data.error?.message ??
        data.message ??
        `拉取模型失败（HTTP ${response.status}）`,
    );
  }
  return data;
}

async function fetchDataModelIds(
  url: string,
  headers: HeadersInit,
  fallback?: ModelListRequest,
): Promise<string[]> {
  const data = await request<DataModelList>(
    url,
    headers,
    fallback
      ? () => request<DataModelList>(fallback.url, fallback.headers)
      : undefined,
  );
  return data.data?.flatMap(({ id }) => (id ? [id] : [])) ?? [];
}

function getOpenAIModelListUrl(baseUrl: string): string | null {
  const fallbackBase = baseUrl.replace(/\/anthropic(?:\/v\d+)?$/i, "/v1");
  return fallbackBase === baseUrl ? null : `${fallbackBase}/models`;
}

export async function fetchAIModelIds(
  config: AIModelConfig,
): Promise<string[]> {
  const baseUrl = config.baseUrl.trim().replace(/\/+$/, "");
  const apiKey = config.apiKey.trim();

  if (!baseUrl) throw new Error("请先填写 Base URL");
  if (!apiKey) throw new Error("请先填写 API Key");

  let models: string[];

  switch (config.provider) {
    case "openai": {
      models = await fetchDataModelIds(`${baseUrl}/models`, {
        Authorization: `Bearer ${apiKey}`,
      });
      break;
    }
    case "anthropic": {
      const url = new URL(`${baseUrl}/models`);
      const fallbackUrl = getOpenAIModelListUrl(baseUrl);
      url.searchParams.set("limit", "1000");
      models = await fetchDataModelIds(
        url.toString(),
        {
          "anthropic-dangerous-direct-browser-access": "true",
          "anthropic-version": "2023-06-01",
          "x-api-key": apiKey,
        },
        fallbackUrl
          ? {
              url: fallbackUrl,
              headers: { Authorization: `Bearer ${apiKey}` },
            }
          : undefined,
      );
      break;
    }
    case "google": {
      const url = new URL(`${baseUrl}/models`);
      url.searchParams.set("pageSize", "1000");
      const data = await request<{
        models?: Array<{
          name?: string;
          supportedGenerationMethods?: string[];
        }>;
      }>(url.toString(), { "x-goog-api-key": apiKey });
      models =
        data.models?.flatMap(({ name, supportedGenerationMethods }) => {
          if (
            !name ||
            (supportedGenerationMethods &&
              !supportedGenerationMethods.includes("generateContent"))
          ) {
            return [];
          }
          return [name.replace(/^models\//, "")];
        }) ?? [];
      break;
    }
  }

  return [...new Set(models)].sort((left, right) =>
    left.localeCompare(right),
  );
}
