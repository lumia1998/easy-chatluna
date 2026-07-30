import {
  db,
  type PresetModel,
  type PresetVersionModel,
  type PresetVersionSource,
} from "@/lib/database";
import {
  isCharacterPresetTemplate,
  isRawPreset,
  type CharacterPresetTemplate,
  type RawPreset,
} from "@/types/preset";

/**
 * 构建下一版预设模型：递增 revision、更新 lastModified，
 * 并根据类型校验/提取名称。
 */
export function createNextPresetModel(
  latest: PresetModel,
  nextPresetData: PresetModel["preset"],
  activeVersionId?: string,
): PresetModel {
  let name: string;
  if (latest.type === "main") {
    if (!isRawPreset(nextPresetData)) {
      throw new Error("主插件预设写入了不匹配的数据结构");
    }
    name = nextPresetData.keywords[0] || latest.name;
  } else {
    if (!isCharacterPresetTemplate(nextPresetData)) {
      throw new Error("伪装预设写入了不匹配的数据结构");
    }
    name = nextPresetData.name || latest.name;
  }

  return {
    ...latest,
    name,
    preset: nextPresetData,
    revision: (latest.revision ?? 1) + 1,
    lastModified: Math.max(Date.now(), latest.lastModified + 1),
    activeVersionId,
  };
}

/**
 * 创建一条版本快照记录。
 * 可选传入 id，不传则自动生成 UUID。
 */
export function createVersionRecord(
  model: PresetModel,
  label: string,
  source: PresetVersionSource,
  id: string = crypto.randomUUID(),
): PresetVersionModel {
  return {
    id,
    presetId: model.id,
    presetType: model.type,
    name: model.name,
    label,
    source,
    createdAt: Date.now(),
    revision: model.revision ?? 1,
    preset: model.preset,
  };
}

/**
 * 乐观锁冲突。单独成类，让调用方能把「预设被改过」和真正的写入故障区分开，
 * 从而保留已经花费模型调用得到的生成结果，而不是一并丢弃。
 */
export class PresetRevisionConflictError extends Error {
  readonly expectedRevision: number;
  readonly actualRevision: number;

  constructor(expectedRevision: number, actualRevision: number) {
    super("生成期间预设已变化，未应用过期结果");
    this.name = "PresetRevisionConflictError";
    this.expectedRevision = expectedRevision;
    this.actualRevision = actualRevision;
  }
}

/**
 * 原子化读-改-写事务。
 * 仅在事务内执行本地 get/validate/put，禁止在其中进行网络或模型 await 操作。
 * 返回最终写入数据库的 PresetModel（含 lastModified）。
 */
export async function withPresetTransaction(
  id: string,
  mutator: (latest: PresetModel) => PresetModel["preset"] | PresetModel,
  options: {
    expectedRevision?: number;
    version?: {
      label: string;
      source: PresetVersionSource;
    };
  } = {},
): Promise<PresetModel> {
  return db.transaction("rw", db.presets, db.presetVersions, async () => {
    const latest = await db.presets.get(id);
    if (!latest) {
      throw new Error(`预设不存在：${id}`);
    }
    const currentRevision = latest.revision ?? 1;
    if (
      options.expectedRevision !== undefined &&
      currentRevision !== options.expectedRevision
    ) {
      throw new PresetRevisionConflictError(
        options.expectedRevision,
        currentRevision,
      );
    }

    const result = mutator(latest);
    const nextPresetData =
      result &&
      typeof result === "object" &&
      "preset" in result &&
      "id" in result &&
      "type" in result
        ? (result as PresetModel).preset
        : (result as PresetModel["preset"]);

    let generatedVersionId: string | undefined;
    if (options.version) {
      const versionCount = await db.presetVersions
        .where("presetId")
        .equals(id)
        .count();
      if (versionCount === 0) {
        await db.presetVersions.add(
          createVersionRecord(latest, "首次生成前", "initial"),
        );
      }
      generatedVersionId = crypto.randomUUID();
    }

    const nextModel = createNextPresetModel(
      latest,
      nextPresetData,
      generatedVersionId,
    );

    await db.presets.put(nextModel);
    if (options.version && generatedVersionId) {
      await db.presetVersions.add(
        createVersionRecord(
          nextModel,
          options.version.label,
          options.version.source,
          generatedVersionId,
        ),
      );
    }
    const stored = await db.presets.get(id);
    if (!stored) {
      throw new Error(`预设写入后丢失：${id}`);
    }
    return stored;
  });
}

/**
 * 删除预设及其关联聊天记录与版本历史。
 */
export async function deletePreset(id: string) {
  return db.transaction(
    "rw",
    db.presets,
    db.agentChats,
    db.presetVersions,
    async () => {
      await Promise.all([
        db.presets.delete(id),
        db.agentChats.delete(`main:${id}`),
        db.agentChats.delete(`character:${id}`),
        db.presetVersions.where("presetId").equals(id).delete(),
      ]);
    },
  );
}

/**
 * 按 ID 获取预设记录。
 */
export function getPreset(id: string) {
  return db.presets.get(id);
}

/**
 * 重命名预设。名称由预设数据推导（主插件取 keywords[0]，伪装取 name），
 * 因此改名要写回预设本身，才能与导出结果保持一致。
 */
export function renamePresetData(
  latest: PresetModel,
  name: string,
): PresetModel["preset"] {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("预设名称不能为空");
  if (latest.type === "main") {
    const preset = latest.preset as RawPreset;
    const keywords = [...(preset.keywords ?? [])];
    if (keywords.length === 0) keywords.push(trimmed);
    else keywords[0] = trimmed;
    return { ...preset, keywords };
  }
  const preset = latest.preset as CharacterPresetTemplate;
  const aliases = (preset.nick_name ?? []).filter(
    (value) => value !== preset.name && value !== `@${preset.name}`,
  );
  return {
    ...preset,
    name: trimmed,
    nick_name: [...new Set([trimmed, ...aliases, `@${trimmed}`])],
  };
}
