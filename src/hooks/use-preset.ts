"use client";

import {
  db,
  isPresetModel,
  type PresetModel,
  type PresetVersionModel,
  type WorkspaceChatModel,
} from "@/lib/database";
import { useLiveQuery } from "dexie-react-hooks";

export function usePresets() {
  return useLiveQuery(
    async () => (await db.presets.toArray()).filter(isPresetModel),
    [],
    [] as PresetModel[],
  );
}

export function useRecentPresets() {
  return useLiveQuery(
    async () =>
      (await db.presets.orderBy("lastModified").reverse().toArray())
        .filter(isPresetModel)
        .slice(0, 6),
    [],
    [] as PresetModel[],
  );
}

export function usePreset(id: string) {
  return useLiveQuery(
    async () => {
      const preset = await db.presets.get(id);
      return preset && isPresetModel(preset) ? preset : undefined;
    },
    [id],
    null as PresetModel | null | undefined,
  );
}

export function usePresetVersions(presetId: string) {
  return useLiveQuery(
    async () => {
      const versions = await db.presetVersions
        .where("presetId")
        .equals(presetId)
        .toArray();
      return versions.sort((left, right) => right.createdAt - left.createdAt);
    },
    [presetId],
    [] as PresetVersionModel[],
  );
}

export function useWorkspaceChats() {
  return useLiveQuery(
    () => db.workspaceChats.orderBy("updatedAt").reverse().toArray(),
    [],
    [] as WorkspaceChatModel[],
  );
}

export function useWorkspaceChat(id: string | null) {
  return useLiveQuery(
    () => (id ? db.workspaceChats.get(id) : undefined),
    [id],
    null as WorkspaceChatModel | null | undefined,
  );
}
