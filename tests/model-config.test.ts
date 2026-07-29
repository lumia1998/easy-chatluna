import assert from "node:assert/strict";
import test from "node:test";
import "fake-indexeddb/auto";
import {
  AI_MODEL_CONFIG_ENCRYPTED_SECRET_STORAGE_KEY,
  AI_MODEL_CONFIG_SECRET_STORAGE_KEY,
  AI_MODEL_CONFIG_STORAGE_KEY,
} from "../src/types/ai.ts";
import {
  hydrateAIModelConfigSecrets,
  loadAIModelConfigStore,
  saveAIModelConfigStore,
  waitForAIModelSecretPersistence,
} from "../src/lib/ai/model-config.ts";

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

test("encrypts persisted API keys and restores them after hydration", async () => {
  const local = new MemoryStorage();
  const session = new MemoryStorage();
  Object.assign(globalThis, { localStorage: local, sessionStorage: session });
  local.setItem(
    AI_MODEL_CONFIG_STORAGE_KEY,
    JSON.stringify({
      activeConfigId: "one",
      configs: [{
        id: "one",
        name: "OpenAI",
        provider: "openai",
        apiKey: "sk-secret-value",
        baseUrl: "https://api.openai.com/v1",
        model: "gpt-test",
        availableModels: [],
        reasoning: "medium",
      }],
    }),
  );

  await hydrateAIModelConfigSecrets();
  const loaded = loadAIModelConfigStore();
  assert.equal(loaded.configs[0]?.apiKey, "sk-secret-value");
  assert.doesNotMatch(local.getItem(AI_MODEL_CONFIG_STORAGE_KEY) ?? "", /secret|apiKey/);
  await waitForAIModelSecretPersistence();
  assert.doesNotMatch(
    local.getItem(AI_MODEL_CONFIG_ENCRYPTED_SECRET_STORAGE_KEY) ?? "",
    /sk-secret-value/,
  );
  assert.equal(session.getItem(AI_MODEL_CONFIG_SECRET_STORAGE_KEY), null);

  saveAIModelConfigStore(loaded);
  await waitForAIModelSecretPersistence();
  assert.doesNotMatch(local.getItem(AI_MODEL_CONFIG_STORAGE_KEY) ?? "", /sk-secret-value/);
  await hydrateAIModelConfigSecrets();
  assert.equal(loadAIModelConfigStore().configs[0]?.apiKey, "sk-secret-value");
});

test("removes malformed legacy model configuration", () => {
  const local = new MemoryStorage();
  const session = new MemoryStorage();
  Object.assign(globalThis, { localStorage: local, sessionStorage: session });
  local.setItem(AI_MODEL_CONFIG_STORAGE_KEY, "{broken:sk-secret-value");
  assert.deepEqual(loadAIModelConfigStore(), {
    configs: [],
    activeConfigId: null,
  });
  assert.equal(local.getItem(AI_MODEL_CONFIG_STORAGE_KEY), null);
});
