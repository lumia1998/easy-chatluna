/**
 * preset-store 模块 —— 向后兼容的 barrel 导出。
 *
 * 内部已拆分为：
 * - templates/default-main.ts      主预设默认模板数据
 * - templates/default-character.ts  角色预设默认模板 (YAML 源文本)
 * - preset-factory.ts              预设创建工厂函数
 * - preset-repository.ts           数据仓库（事务、删除、获取）
 * - preset-version-service.ts      版本恢复服务
 */

export {
  createPreset,
  createMainPreset,
  createCharacterPreset,
  createWorkspacePreset,
} from "@/lib/preset-factory";
export {
  withPresetTransaction,
  deletePreset,
  getPreset,
  renamePresetData,
} from "@/lib/preset-repository";
export { restorePresetVersionTransaction } from "@/lib/preset-version-service";
