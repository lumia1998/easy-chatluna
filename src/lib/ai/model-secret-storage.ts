import { AI_MODEL_CONFIG_ENCRYPTED_SECRET_STORAGE_KEY } from "@/types/ai";

const DATABASE_NAME = "easy-chatluna-credentials";
const STORE_NAME = "keys";
const KEY_ID = "ai-model-config-aes-gcm";
const CREDENTIAL_LOCK_NAME = "easy-chatluna-ai-credentials";

interface EncryptedSecretPayload {
  version: 1;
  iv: string;
  data: string;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function openCredentialDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("无法打开凭据存储"));
  });
}

async function getStoredKey(database: IDBDatabase): Promise<CryptoKey | undefined> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).get(KEY_ID);
    request.onsuccess = () =>
      resolve(request.result instanceof CryptoKey ? request.result : undefined);
    request.onerror = () => reject(request.error ?? new Error("无法读取设备密钥"));
  });
}

async function storeKey(database: IDBDatabase, key: CryptoKey): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(key, KEY_ID);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("无法保存设备密钥"));
  });
}

async function getOrCreateKey(): Promise<CryptoKey> {
  const database = await openCredentialDatabase();
  try {
    const stored = await getStoredKey(database);
    if (stored) return stored;
    const key = await crypto.subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
    await storeKey(database, key);
    return key;
  } finally {
    database.close();
  }
}

async function withCredentialLock<T>(callback: () => Promise<T>): Promise<T> {
  const lockManager = (
    navigator as Navigator & {
      locks?: { request: <Result>(name: string, task: () => Promise<Result>) => Promise<Result> };
    }
  ).locks;
  return lockManager
    ? lockManager.request(CREDENTIAL_LOCK_NAME, callback)
    : callback();
}

function isEncryptedPayload(value: unknown): value is EncryptedSecretPayload {
  if (!value || typeof value !== "object") return false;
  const payload = value as Partial<EncryptedSecretPayload>;
  return payload.version === 1 && typeof payload.iv === "string" && typeof payload.data === "string";
}

async function decryptSecrets(
  raw: string,
  key: CryptoKey,
): Promise<Record<string, string>> {
  const payload: unknown = JSON.parse(raw);
  if (!isEncryptedPayload(payload)) throw new Error("加密凭据格式无效");
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBytes(payload.iv) },
    key,
    base64ToBytes(payload.data),
  );
  const parsed: unknown = JSON.parse(new TextDecoder().decode(decrypted));
  if (!parsed || typeof parsed !== "object") return {};
  return Object.fromEntries(
    Object.entries(parsed).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

async function writeSecrets(
  secrets: Record<string, string>,
  key: CryptoKey,
): Promise<void> {
  if (Object.keys(secrets).length === 0) {
    localStorage.removeItem(AI_MODEL_CONFIG_ENCRYPTED_SECRET_STORAGE_KEY);
    return;
  }
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(secrets));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext);
  localStorage.setItem(
    AI_MODEL_CONFIG_ENCRYPTED_SECRET_STORAGE_KEY,
    JSON.stringify({
      version: 1,
      iv: bytesToBase64(iv),
      data: bytesToBase64(new Uint8Array(encrypted)),
    } satisfies EncryptedSecretPayload),
  );
}

export async function saveEncryptedModelSecrets(
  secrets: Record<string, string>,
): Promise<void> {
  await withCredentialLock(async () => {
    const key = await getOrCreateKey();
    await writeSecrets(secrets, key);
  });
}

export async function updateEncryptedModelSecrets(
  updates: Record<string, string>,
  removedIds: string[],
): Promise<void> {
  await withCredentialLock(async () => {
    const key = await getOrCreateKey();
    const raw = localStorage.getItem(AI_MODEL_CONFIG_ENCRYPTED_SECRET_STORAGE_KEY);
    const current = raw ? await decryptSecrets(raw, key) : {};
    for (const id of removedIds) delete current[id];
    for (const [id, secret] of Object.entries(updates)) {
      if (secret.trim()) current[id] = secret;
      else delete current[id];
    }
    await writeSecrets(current, key);
  });
}

export async function loadEncryptedModelSecrets(): Promise<Record<string, string>> {
  const raw = localStorage.getItem(AI_MODEL_CONFIG_ENCRYPTED_SECRET_STORAGE_KEY);
  if (!raw) return {};
  try {
    return await withCredentialLock(async () => {
      const key = await getOrCreateKey();
      return decryptSecrets(raw, key);
    });
  } catch {
    return {};
  }
}
