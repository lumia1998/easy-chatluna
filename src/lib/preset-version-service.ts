import { db, type PresetModel } from "@/lib/database";
import {
  createNextPresetModel,
  createVersionRecord,
} from "@/lib/preset-repository";

/**
 * 将预设恢复到指定版本。
 * 若当前无活跃版本 ID，会先自动创建一条恢复点快照。
 * 返回更新后的 PresetModel。
 */
export async function restorePresetVersionTransaction(
  presetId: string,
  versionId: string,
): Promise<PresetModel> {
  return db.transaction("rw", db.presets, db.presetVersions, async () => {
    const [latest, version] = await Promise.all([
      db.presets.get(presetId),
      db.presetVersions.get(versionId),
    ]);
    if (!latest) throw new Error(`预设不存在：${presetId}`);
    if (!version || version.presetId !== presetId) {
      throw new Error("版本不存在或不属于当前预设");
    }
    if (version.presetType !== latest.type) {
      throw new Error("版本类型与当前预设不匹配");
    }

    if (!latest.activeVersionId) {
      await db.presetVersions.add(
        createVersionRecord(latest, "切换前快照", "restore-point"),
      );
    }

    const nextModel = createNextPresetModel(
      latest,
      version.preset,
      version.id,
    );
    await db.presets.put(nextModel);
    return nextModel;
  });
}
