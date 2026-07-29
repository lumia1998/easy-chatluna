import {
  AI_MODEL_CONFIG_STORAGE_KEY,
  AI_MODEL_CONFIG_SECRET_STORAGE_KEY,
  AI_MODEL_CONFIG_CHANGE_EVENT,
  AI_MODEL_SECRET_PERSISTENCE_ERROR_EVENT,
  AI_PROVIDER_DEFAULT_BASE_URLS,
  AI_PROVIDER_LABELS,
  type AIModelConfig,
  type AIModelConfigStore,
  type AIProviderFormat,
  type AIReasoningLevel,
} from "@/types/ai";
import {
  loadEncryptedModelSecrets,
  saveEncryptedModelSecrets,
  updateEncryptedModelSecrets,
} from "@/lib/ai/model-secret-storage";

const PROVIDERS: AIProviderFormat[] = ["openai", "anthropic", "google"];
const REASONING_LEVELS: AIReasoningLevel[] = [
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
];
const volatileSecrets = new Map<string, string>();
let secretWriteQueue = Promise.resolve();
const LEGACY_PERSISTENT_SECRET_STORAGE_KEY =
  "chatluna_ai_model_config_persistent_secrets:v1";

function isProvider(value: unknown): value is AIProviderFormat {
  return typeof value === "string" && PROVIDERS.includes(value as AIProviderFormat);
}

function isReasoningLevel(value: unknown): value is AIReasoningLevel {
  return (
    typeof value === "string" &&
    REASONING_LEVELS.includes(value as AIReasoningLevel)
  );
}

function normalizeAvailableModels(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((model): model is string => typeof model === "string" && model.trim().length > 0))]
    .map((model) => model.trim())
    .sort((left, right) => left.localeCompare(right));
}

function normalizeConfig(value: unknown): AIModelConfig | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const raw = value as Partial<AIModelConfig>;
  if (typeof raw.id !== "string" || !raw.id.trim()) {
    return null;
  }
  if (!isProvider(raw.provider)) {
    return null;
  }

  return {
    id: raw.id,
    name: typeof raw.name === "string" ? raw.name : "未命名配置",
    provider: raw.provider,
    apiKey: typeof raw.apiKey === "string" ? raw.apiKey : "",
    baseUrl:
      typeof raw.baseUrl === "string" && raw.baseUrl.trim()
        ? raw.baseUrl
        : AI_PROVIDER_DEFAULT_BASE_URLS[raw.provider],
    model: typeof raw.model === "string" ? raw.model : "",
    availableModels: normalizeAvailableModels(raw.availableModels),
    reasoning: isReasoningLevel(raw.reasoning) ? raw.reasoning : "medium",
  };
}

export function createEmptyAIModelConfigStore(): AIModelConfigStore {
  return {
    configs: [],
    activeConfigId: null,
  };
}

export function resolveActiveConfigId(
  configs: ReadonlyArray<Pick<AIModelConfig, "id">>,
  preferredId: string | null | undefined,
): string | null {
  if (preferredId && configs.some((config) => config.id === preferredId)) {
    return preferredId;
  }
  return configs[0]?.id ?? null;
}

export function createAIModelConfig(
  partial?: Partial<Omit<AIModelConfig, "id">> & { id?: string },
): AIModelConfig {
  const provider = partial?.provider ?? "openai";
  return {
    id: partial?.id ?? crypto.randomUUID(),
    name: partial?.name?.trim() || `${AI_PROVIDER_LABELS[provider]} 配置`,
    provider,
    apiKey: partial?.apiKey ?? "",
    baseUrl:
      partial?.baseUrl?.trim() || AI_PROVIDER_DEFAULT_BASE_URLS[provider],
    model: partial?.model ?? "",
    availableModels: normalizeAvailableModels(partial?.availableModels),
    reasoning: partial?.reasoning ?? "medium",
  };
}

export function loadAIModelConfigStore(): AIModelConfigStore {
  try {
    const saved = localStorage.getItem(AI_MODEL_CONFIG_STORAGE_KEY);
    if (!saved) {
      return createEmptyAIModelConfigStore();
    }

    const parsed = JSON.parse(saved) as Partial<AIModelConfigStore>;
    if (!parsed || typeof parsed !== "object") {
      localStorage.removeItem(AI_MODEL_CONFIG_STORAGE_KEY);
      return createEmptyAIModelConfigStore();
    }

    const sessionSecrets = loadSecretMap(
      sessionStorage,
      AI_MODEL_CONFIG_SECRET_STORAGE_KEY,
    );
    const configs = Array.isArray(parsed.configs)
      ? parsed.configs
          .map((item) => normalizeConfig(item))
          .filter((item): item is AIModelConfig => item !== null)
          .map((config) => {
            const legacySecret = config.apiKey.trim();
            if (legacySecret) {
              volatileSecrets.set(config.id, legacySecret);
            }
            return {
              ...config,
              apiKey:
                sessionSecrets[config.id] ??
                volatileSecrets.get(config.id) ??
                legacySecret,
            };
          })
      : [];

    const preferredId =
      typeof parsed.activeConfigId === "string" ? parsed.activeConfigId : null;
    const activeConfigId = resolveActiveConfigId(configs, preferredId);

    return { configs, activeConfigId };
  } catch {
    try {
      localStorage.removeItem(AI_MODEL_CONFIG_STORAGE_KEY);
    } catch {
      // Ignore unavailable storage while returning a clean in-memory store.
    }
    return createEmptyAIModelConfigStore();
  }
}

export function saveAIModelConfigStore(store: AIModelConfigStore): void {
  const configs = store.configs
    .map((item) => normalizeConfig(item))
    .filter((item): item is AIModelConfig => item !== null)
    .map((config) => ({
      ...config,
      name: config.name,
      apiKey: config.apiKey.trim(),
      baseUrl: config.baseUrl.trim(),
      model: config.model.trim(),
    }));

  const activeConfigId = resolveActiveConfigId(configs, store.activeConfigId);

  persistModelConfigStore({ configs, activeConfigId });
  queueMicrotask(() => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event(AI_MODEL_CONFIG_CHANGE_EVENT));
    }
  });
}

function persistModelConfigStore(store: AIModelConfigStore): void {
  const secretUpdates: Record<string, string> = {};
  const removedSecretIds: string[] = [];
  const publicConfigs = store.configs.map((config) => {
    const secret = config.apiKey.trim();
    const previousSecret = volatileSecrets.get(config.id) ?? "";
    if (secret !== previousSecret) secretUpdates[config.id] = secret;
    if (secret) {
      volatileSecrets.set(config.id, secret);
    } else {
      volatileSecrets.delete(config.id);
    }
    const { apiKey: _apiKey, ...publicConfig } = config;
    void _apiKey;
    return publicConfig;
  });

  for (const id of [...volatileSecrets.keys()]) {
    if (!store.configs.some((config) => config.id === id)) {
      volatileSecrets.delete(id);
      removedSecretIds.push(id);
    }
  }

  if (Object.keys(secretUpdates).length > 0 || removedSecretIds.length > 0) {
    secretWriteQueue = secretWriteQueue
      .catch(() => undefined)
      .then(() =>
        updateEncryptedModelSecrets(secretUpdates, removedSecretIds),
      )
      .catch(() => {
        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new Event(AI_MODEL_SECRET_PERSISTENCE_ERROR_EVENT),
          );
        }
      });
  }

  localStorage.setItem(
    AI_MODEL_CONFIG_STORAGE_KEY,
    JSON.stringify({
      configs: publicConfigs,
      activeConfigId: store.activeConfigId,
    }),
  );
}

export async function hydrateAIModelConfigSecrets(): Promise<void> {
  const [encryptedSecrets, legacyPersistentSecrets] = await Promise.all([
    loadEncryptedModelSecrets(),
    Promise.resolve(
      loadSecretMap(localStorage, LEGACY_PERSISTENT_SECRET_STORAGE_KEY),
    ),
  ]);
  const legacySessionSecrets = loadSecretMap(
    sessionStorage,
    AI_MODEL_CONFIG_SECRET_STORAGE_KEY,
  );
  const embeddedLegacySecrets = loadEmbeddedLegacySecrets();
  const secrets = {
    ...embeddedLegacySecrets,
    ...legacyPersistentSecrets,
    ...legacySessionSecrets,
    ...encryptedSecrets,
  };
  const hasLegacySecrets =
    Object.keys(embeddedLegacySecrets).length > 0 ||
    Object.keys(legacyPersistentSecrets).length > 0 ||
    Object.keys(legacySessionSecrets).length > 0;
  if (hasLegacySecrets) {
    await saveEncryptedModelSecrets(secrets);
    stripEmbeddedLegacySecrets();
    try {
      sessionStorage.removeItem(AI_MODEL_CONFIG_SECRET_STORAGE_KEY);
      localStorage.removeItem(LEGACY_PERSISTENT_SECRET_STORAGE_KEY);
    } catch {
      // The encrypted copy is durable even if legacy cleanup is unavailable.
    }
  }
  volatileSecrets.clear();
  for (const [id, secret] of Object.entries(secrets)) {
    if (secret.trim()) volatileSecrets.set(id, secret);
  }
}

export async function waitForAIModelSecretPersistence(): Promise<void> {
  await secretWriteQueue;
}

function loadSecretMap(
  storage: Storage,
  key: string,
): Record<string, string> {
  try {
    const raw = storage.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object") return {};
    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string",
      ),
    );
  } catch {
    return {};
  }
}

function loadEmbeddedLegacySecrets(): Record<string, string> {
  try {
    const raw = localStorage.getItem(AI_MODEL_CONFIG_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Partial<AIModelConfigStore>;
    if (!Array.isArray(parsed.configs)) return {};
    return Object.fromEntries(
      parsed.configs.flatMap((config) => {
        if (!config || typeof config !== "object") return [];
        const item = config as Partial<AIModelConfig>;
        return typeof item.id === "string" && typeof item.apiKey === "string" && item.apiKey.trim()
          ? [[item.id, item.apiKey.trim()] as const]
          : [];
      }),
    );
  } catch {
    return {};
  }
}

function stripEmbeddedLegacySecrets(): void {
  const raw = localStorage.getItem(AI_MODEL_CONFIG_STORAGE_KEY);
  if (!raw) return;
  const parsed = JSON.parse(raw) as Partial<AIModelConfigStore>;
  if (!Array.isArray(parsed.configs)) return;
  parsed.configs = parsed.configs.map((config) => {
    if (!config || typeof config !== "object") return config;
    const { apiKey: _apiKey, ...publicConfig } = config as AIModelConfig;
    void _apiKey;
    return publicConfig as AIModelConfig;
  });
  localStorage.setItem(AI_MODEL_CONFIG_STORAGE_KEY, JSON.stringify(parsed));
}

export function getActiveAIModelConfig(
  store?: AIModelConfigStore,
): AIModelConfig | null {
  const data = store ?? loadAIModelConfigStore();
  if (!data.activeConfigId) {
    return null;
  }
  return data.configs.find((config) => config.id === data.activeConfigId) ?? null;
}

export function isAIModelConfigReady(
  config: AIModelConfig | null | undefined,
): boolean {
  if (!config) {
    return false;
  }
  return Boolean(
    config.provider &&
      config.apiKey.trim() &&
      config.baseUrl.trim() &&
      config.model.trim(),
  );
}

export function getProviderDefaultBaseUrl(provider: AIProviderFormat): string {
  return AI_PROVIDER_DEFAULT_BASE_URLS[provider];
}
