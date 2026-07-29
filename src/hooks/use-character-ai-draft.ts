"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CHARACTER_AI_DRAFT_KEYS,
  createEmptyAIRoleDraft,
  type AIRoleDraftFields,
  type CharacterAIDraftKey,
} from "@/lib/ai/character-details";
import type { CharacterPresetTemplate } from "@/types/preset";
import type { PresetFieldUpdater } from "@/hooks/use-preset-updater";
import { toast } from "sonner";

function readDraft(
  preset: CharacterPresetTemplate | null | undefined,
): AIRoleDraftFields {
  if (!preset) {
    return createEmptyAIRoleDraft();
  }

  return {
    bot_id: preset.bot_id || "",
    owner_id: preset.owner_id || "",
    description: preset.description || "",
    personality: preset.personality || "",
    hobbies: preset.hobbies || "",
    dialogue_examples: preset.dialogue_examples || "",
    chat_style: preset.chat_style || "",
    chat_behavior: preset.chat_behavior || "",
    relationship: preset.relationship || "",
    stickers: preset.stickers || "",
  };
}

function persistField(
  updater: PresetFieldUpdater | undefined,
  key: CharacterAIDraftKey,
  value: string,
) : Promise<void> {
  if (!updater) {
    return Promise.resolve();
  }
  return updater(key, value as never);
}

function reportPersistError() {
  toast.error("角色设定保存失败", { description: "请检查浏览器存储后重试" });
}

/**
 * Debounced draft for character AI detail fields.
 * Accepts nullable / non-character presets so the hook can be called unconditionally.
 * Remount with key={presetId} when switching presets.
 * Flushes pending field writes on unmount instead of discarding them.
 */
export function useCharacterAIDraft(
  preset: CharacterPresetTemplate | null | undefined,
  updatePreset?: PresetFieldUpdater,
  debounceMs = 400,
  activeVersionId?: string,
) {
  const [draft, setDraft] = useState<AIRoleDraftFields>(() =>
    readDraft(preset),
  );
  const [isDirty, setIsDirty] = useState(false);

  const draftRef = useRef(draft);
  const generatedDraftRef = useRef(draft);
  const initializedRef = useRef(Boolean(preset));
  const activeVersionRef = useRef(activeVersionId);
  const updatePresetRef = useRef(updatePreset);
  const pendingRef = useRef<Partial<Record<CharacterAIDraftKey, string>>>({});
  const timersRef = useRef<
    Partial<Record<CharacterAIDraftKey, ReturnType<typeof setTimeout>>>
  >({});

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  useEffect(() => {
    updatePresetRef.current = updatePreset;
  }, [updatePreset]);

  useEffect(() => {
    if (!preset) {
      return;
    }

    const restoredVersionChanged = Boolean(
      activeVersionId && activeVersionId !== activeVersionRef.current,
    );
    activeVersionRef.current = activeVersionId;
    if (initializedRef.current && !restoredVersionChanged) return;

    if (restoredVersionChanged) {
      Object.values(timersRef.current).forEach((timeout) => {
        if (timeout) clearTimeout(timeout);
      });
      timersRef.current = {};
      pendingRef.current = {};
    }

    const nextDraft = readDraft(preset);
    initializedRef.current = true;
    draftRef.current = nextDraft;
    generatedDraftRef.current = nextDraft;
    setDraft(nextDraft);
    setIsDirty(false);
  }, [activeVersionId, preset]);

  useEffect(() => {
    return () => {
      Object.values(timersRef.current).forEach((timeout) => {
        if (timeout) clearTimeout(timeout);
      });
      timersRef.current = {};

      const pending = pendingRef.current;
      const updater = updatePresetRef.current;
      pendingRef.current = {};

      for (const key of CHARACTER_AI_DRAFT_KEYS) {
        const value = pending[key];
        if (value === undefined) {
          continue;
        }
        void persistField(updater, key, value).catch(reportPersistError);
      }
    };
  }, []);

  const setField = useCallback(
    (key: CharacterAIDraftKey, value: string) => {
      const next = { ...draftRef.current, [key]: value };
      draftRef.current = next;
      setDraft(next);
      setIsDirty(
        CHARACTER_AI_DRAFT_KEYS.some(
          (draftKey) => next[draftKey] !== generatedDraftRef.current[draftKey],
        ),
      );
      pendingRef.current[key] = value;

      const existing = timersRef.current[key];
      if (existing) {
        clearTimeout(existing);
      }

      timersRef.current[key] = setTimeout(() => {
        delete timersRef.current[key];
        delete pendingRef.current[key];
        void persistField(updatePresetRef.current, key, value).catch(
          reportPersistError,
        );
      }, debounceMs);
    },
    [debounceMs],
  );

  const getMergedCharacterPreset = useCallback(
    (
      base: CharacterPresetTemplate | null | undefined,
    ): CharacterPresetTemplate | null => {
      if (!base) {
        return null;
      }
      return {
        ...base,
        ...draftRef.current,
      };
    },
    [],
  );

  const flushPending = useCallback(async (): Promise<boolean> => {
    const writes: Promise<void>[] = [];
    for (const key of CHARACTER_AI_DRAFT_KEYS) {
      const timer = timersRef.current[key];
      if (timer) clearTimeout(timer);
      delete timersRef.current[key];
      const value = pendingRef.current[key];
      if (value === undefined) continue;
      delete pendingRef.current[key];
      writes.push(persistField(updatePresetRef.current, key, value));
    }
    const results = await Promise.allSettled(writes);
    if (results.some((result) => result.status === "rejected")) {
      reportPersistError();
      return false;
    }
    return true;
  }, []);

  const markGenerated = useCallback((generatedDraft = draftRef.current) => {
    generatedDraftRef.current = { ...generatedDraft };
    setIsDirty(
      CHARACTER_AI_DRAFT_KEYS.some(
        (key) => draftRef.current[key] !== generatedDraft[key],
      ),
    );
  }, []);

  return {
    draft,
    isDirty,
    setField,
    getMergedCharacterPreset,
    markGenerated,
    flushPending,
  };
}
