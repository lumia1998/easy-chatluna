import {
  CharacterPresetTemplate,
  isCharacterPresetTemplate,
  isRawPreset,
  RawPreset,
} from "@/types/preset";
import { stripSensitivePresetKeys } from "@/lib/preset-sanitizer";
import { serializePresetData } from "@/lib/ai/generated-yaml";
import type { PresetModel } from "@/lib/database";
import { createPreset } from "@/lib/preset-store";
import { load } from "js-yaml";

export const exportPreset = (preset: PresetModel) => {
  const blob = new Blob([makeYaml(preset)], {
    type: "application/yaml;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const name =
    preset.type === "character"
      ? (preset.preset as CharacterPresetTemplate).name
      : (preset.preset as RawPreset).keywords[0];
  a.download = `${name}.yml`;

  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

export async function importPreset(
  preset: string | RawPreset | CharacterPresetTemplate,
) {
  const rawPreset =
    typeof preset === "string"
      ? (load(preset) as RawPreset | CharacterPresetTemplate)
      : preset;

  if (isRawPreset(rawPreset)) {
    const sanitized = stripSensitivePresetKeys(rawPreset);
    return await createPreset({
      name: sanitized.keywords[0],
      type: "main",
      preset: sanitized,
    });
  }

  if (isCharacterPresetTemplate(rawPreset)) {
    const sanitized = stripSensitivePresetKeys(rawPreset);
    return await createPreset({
      name: sanitized.name,
      type: "character",
      preset: sanitized,
    });
  }

  throw new Error("Invalid preset");
}

export function makeYaml(preset: PresetModel) {
  return serializePresetData(preset.preset);
}
