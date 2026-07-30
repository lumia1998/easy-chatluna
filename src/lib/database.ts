import type { UIMessage } from "ai";
import { Dexie } from "dexie";
import {
  isCharacterPresetTemplate,
  isRawPreset,
  type CharacterPresetTemplate,
  type RawPreset,
} from "@/types/preset";
import { stripSensitivePresetKeys } from "@/lib/preset-sanitizer";

export interface PresetModel<
  T extends "main" | "character" = "main" | "character",
> {
  id: string;
  name: string;
  type: T;
  lastModified: number;
  revision: number;
  activeVersionId?: string;
  preset: T extends "main" ? RawPreset : CharacterPresetTemplate;
}

export type PresetVersionSource =
  | "initial"
  | "ai-generation"
  | "restore-point";

export interface PresetVersionModel {
  id: string;
  presetId: string;
  presetType: PresetModel["type"];
  name: string;
  label: string;
  source: PresetVersionSource;
  createdAt: number;
  revision: number;
  preset: PresetModel["preset"];
}

export interface AgentChatModel {
  id: string;
  messages: UIMessage[];
  updatedAt: number;
}

export interface WorkspaceChatSource {
  index: number;
  title: string;
  heading: string;
  url: string;
  provenanceUrl: string;
  sourcePath: string;
}

export interface WorkspaceChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: WorkspaceChatSource[];
  retrievalWarning?: string;
}

export interface WorkspaceChatModel {
  id: string;
  title: string;
  messages: WorkspaceChatMessage[];
  createdAt: number;
  updatedAt: number;
}

export function isPresetModel(value: unknown): value is PresetModel {
  if (!value || typeof value !== "object") return false;
  const model = value as Partial<PresetModel>;
  if (
    typeof model.id !== "string" ||
    typeof model.name !== "string" ||
    typeof model.lastModified !== "number" ||
    typeof model.revision !== "number"
  ) return false;
  if (model.type === "main") return isRawPreset(model.preset);
  if (model.type === "character") return isCharacterPresetTemplate(model.preset);
  return false;
}

export const db = new Dexie("chatluna-preset") as Dexie & {
  presets: Dexie.Table<PresetModel, string>;
  agentChats: Dexie.Table<AgentChatModel, string>;
  presetVersions: Dexie.Table<PresetVersionModel, string>;
  workspaceChats: Dexie.Table<WorkspaceChatModel, string>;
};

db.version(1).stores({
  presets: "++id, type, lastModified, preset",
});

db.version(2).stores({
  presets: "++id, type, lastModified, preset",
  agentChats: "id, updatedAt",
});

db.version(3)
  .stores({
    presets: "++id, type, lastModified",
    agentChats: "id, updatedAt",
    presetVersions: "id, presetId, [presetId+createdAt], createdAt",
  })
  .upgrade((transaction) =>
    transaction
      .table<PresetModel>("presets")
      .toCollection()
      .modify((preset) => {
        preset.revision = Math.max(1, preset.revision ?? 1);
        preset.preset = stripSensitivePresetKeys(preset.preset);
      }),
  );

db.version(4).stores({
  presets: "++id, type, lastModified",
  agentChats: "id, updatedAt",
  presetVersions: "id, presetId, [presetId+createdAt], createdAt",
  workspaceChats: "id, updatedAt, createdAt",
});

export type StorageProbeResult =
  | { ok: true }
  | { ok: false; reason: "unsupported" | "blocked"; detail: string };

/**
 * Open the database once at startup so a browser that forbids IndexedDB
 * (Safari private mode, disabled site data) surfaces one clear message
 * instead of every later query rejecting on its own.
 */
export async function probeStorage(): Promise<StorageProbeResult> {
  if (typeof indexedDB === "undefined") {
    return {
      ok: false,
      reason: "unsupported",
      detail: "当前浏览器未提供 IndexedDB。",
    };
  }
  try {
    await db.open();
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      reason: "blocked",
      detail:
        error instanceof Error ? error.message : "无法打开本地数据库。",
    };
  }
}
