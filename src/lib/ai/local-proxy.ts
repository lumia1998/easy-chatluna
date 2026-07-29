const LOCAL_AI_PROXY_PATH = "/__easy_chatluna_ai_proxy";

function shouldUseLocalProxy(): boolean {
  return import.meta.env.DEV;
}

export const fetchThroughLocalProxy: typeof globalThis.fetch = async (
  input,
  init,
) => {
  if (!shouldUseLocalProxy()) {
    return globalThis.fetch(input, init);
  }

  const originalRequest = new Request(input, init);
  const target = originalRequest.url;
  const proxyUrl = `${LOCAL_AI_PROXY_PATH}?url=${encodeURIComponent(target)}`;
  const hasBody =
    originalRequest.method !== "GET" && originalRequest.method !== "HEAD";

  return globalThis.fetch(proxyUrl, {
    method: originalRequest.method,
    headers: originalRequest.headers,
    body: hasBody ? await originalRequest.arrayBuffer() : undefined,
    signal: originalRequest.signal,
  });
};
