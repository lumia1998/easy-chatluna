import { db } from "@/lib/database";
import type { PresetModel } from "@/lib/database";
import { DEFAULT_MAIN_TEMPLATE } from "@/lib/templates/default-main";
import { DEFAULT_CHARACTER_YAML } from "@/lib/templates/default-character";
import { load } from "js-yaml";
import { isRawPreset, type CharacterPresetTemplate } from "@/types/preset";
import {
  WORKSPACE_STARTERS,
  getDefaultFormat,
  type WorkspacePresetType,
} from "@/lib/preset-workspace-data";
import { buildWorkspacePreset } from "@/lib/workspace-preset-export";
import { renameTitle } from "@/lib/workspace-preset-import";

// 模块加载时解析一次，避免每次创建角色预设都重新解析 YAML
const defaultCharacterTemplate: CharacterPresetTemplate =
  load(DEFAULT_CHARACTER_YAML) as CharacterPresetTemplate;

/**
 * XML 属性值转义。
 * 将 &、单引号、<、> 替换为对应的 XML 实体。
 */
function escapeXmlAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/'/g, "&apos;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * 替换模板中的人名占位符。
 * - `__NAME__` → 原始名称
 * - `__XML_NAME__` → XML 转义后的名称
 */
function resolveNamePlaceholders(
  template: string,
  name: string,
): string {
  const xmlName = escapeXmlAttribute(name);
  return template
    .replace(/__NAME__/g, name)
    .replace(/__XML_NAME__/g, xmlName);
}

/**
 * 通用预设创建函数。
 * 向数据库写入一条新预设记录并返回其 ID。
 */
export async function createPreset<
  T extends "main" | "character" = "main" | "character",
>(
  model: Omit<
    PresetModel<T>,
    "lastModified" | "revision" | "activeVersionId" | "id"
  >,
) {
  const id = crypto.randomUUID();
  await db.presets.add({
    lastModified: Date.now(),
    revision: 1,
    ...model,
    id,
  });

  return id;
}

/**
 * 创建主类型预设。
 * 使用默认主模板，仅注入名称作为 keywords。
 */
export async function createMainPreset(name: string) {
  return createPreset({
    name,
    type: "main",
    preset: {
      keywords: [name],
      ...DEFAULT_MAIN_TEMPLATE,
    },
  });
}

/**
 * 创建角色类型预设。
 * 使用默认角色 YAML 模板，替换其中的名称占位符。
 */
export async function createCharacterPreset(name: string) {
  return createPreset({
    name,
    type: "character",
    preset: {
      ...defaultCharacterTemplate,
      name,
      nick_name: [name],
      input: resolveNamePlaceholders(defaultCharacterTemplate.input, name),
      system: resolveNamePlaceholders(defaultCharacterTemplate.system, name),
    },
  });
}

/**
 * 创建一个以工作台起始文档为内容的预设。
 *
 * 新建入口用这个：预设直接带上 Markdown 文档，打开即是工作台可编辑的状态，
 * 且是一条真实记录（可重命名、可删除）。名称从构建结果推导，保证与
 * createNextPresetModel 后续推导的名称一致。
 */
export async function createWorkspacePreset(type: WorkspacePresetType) {
  const taken = new Set((await db.presets.toArray()).map((row) => row.name));
  const base = type === "main" ? "我的主插件预设" : "我的伪装预设";

  for (let attempt = 1; ; attempt += 1) {
    const title = attempt === 1 ? base : `${base} ${attempt}`;
    const source = renameTitle(WORKSPACE_STARTERS[type], title);
    const preset = buildWorkspacePreset(source, type, getDefaultFormat(type));
    const name = isRawPreset(preset) ? preset.keywords[0] : preset.name;
    if (taken.has(name)) continue;
    const id = await createPreset({
      name,
      type,
      preset: preset as PresetModel["preset"],
    });
    return { id, name };
  }
}
