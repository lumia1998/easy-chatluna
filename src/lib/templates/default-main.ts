import type { RawPreset } from "@/types/preset";

/**
 * 主预设的默认模板数据。
 * 仅包含 prompts，运行时由工厂函数注入 keywords。
 */
export const DEFAULT_MAIN_TEMPLATE: Omit<RawPreset, "keywords"> = {
  prompts: [
    {
      role: "system" as const,
      content:
        "You are ChatGPT, a large language model trained by OpenAI. Answer as concisely as possible.",
    },
  ],
};
