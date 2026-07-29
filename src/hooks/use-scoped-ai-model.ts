"use client";

import { useMemo, useState } from "react";
import { useAIModelConfigs } from "@/hooks/use-ai-model-configs";
import type { AIModelConfig, AIReasoningLevel } from "@/types/ai";

export interface ScopedAIModelOption {
  value: string;
  configId: string;
  configName: string;
  model: string;
  provider: AIModelConfig["provider"];
}

function storageKey(scope: string) {
  return `easy-chatluna:scoped-model:${scope}`;
}

function reasoningStorageKey(scope: string) {
  return `easy-chatluna:scoped-reasoning:${scope}`;
}

function readSelection(scope: string): string {
  try {
    return localStorage.getItem(storageKey(scope)) ?? "";
  } catch {
    return "";
  }
}

function readReasoning(scope: string): AIReasoningLevel | null {
  try {
    const value = localStorage.getItem(reasoningStorageKey(scope));
    return value && ["minimal", "low", "medium", "high", "xhigh"].includes(value)
      ? (value as AIReasoningLevel)
      : null;
  } catch {
    return null;
  }
}

export function useScopedAIModel(scope: string) {
  const { configs, activeConfig } = useAIModelConfigs();
  const [storedSelection, setStoredSelection] = useState(() => readSelection(scope));
  const [storedReasoning, setStoredReasoning] = useState(() => readReasoning(scope));
  const options = useMemo<ScopedAIModelOption[]>(
    () =>
      configs.flatMap((config) =>
        [...new Set([config.model, ...config.availableModels].filter(Boolean))].map(
          (model) => ({
            value: `${config.id}::${model}`,
            configId: config.id,
            configName: config.name,
            model,
            provider: config.provider,
          }),
        ),
      ),
    [configs],
  );
  const activeValue = activeConfig
    ? `${activeConfig.id}::${activeConfig.model}`
    : "";
  const fallbackValue = options.some((option) => option.value === activeValue)
    ? activeValue
    : options[0]?.value ?? "";
  const selectionValue = options.some((option) => option.value === storedSelection)
    ? storedSelection
    : fallbackValue;
  const selectedOption = options.find((option) => option.value === selectionValue);
  const selectedBaseConfig = configs.find(
    (config) => config.id === selectedOption?.configId,
  );
  const selectedConfig =
    selectedBaseConfig && selectedOption
      ? {
          ...selectedBaseConfig,
          model: selectedOption.model,
          reasoning: storedReasoning ?? selectedBaseConfig.reasoning,
        }
      : null;

  const setSelectionValue = (value: string) => {
    if (!options.some((option) => option.value === value)) return;
    setStoredSelection(value);
    try {
      localStorage.setItem(storageKey(scope), value);
    } catch {
      // The in-memory selection remains usable when storage is unavailable.
    }
  };

  const setReasoning = (reasoning: AIReasoningLevel) => {
    setStoredReasoning(reasoning);
    try {
      localStorage.setItem(reasoningStorageKey(scope), reasoning);
    } catch {
      // The in-memory reasoning selection remains usable.
    }
  };

  return {
    selectedConfig,
    selectionValue,
    options,
    setSelectionValue,
    setReasoning,
  };
}
