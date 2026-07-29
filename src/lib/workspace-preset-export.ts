import { dump } from "js-yaml";
import type { WorkspaceFormat, WorkspacePresetType } from "./preset-workspace-data";
import type { CharacterPresetTemplate, RawPreset } from "@/types/preset";
import {
  analyzeTemplate,
  escapeTemplateBraces,
  type TemplateEditorContext,
} from "@/lib/prompt-template";

const FORMAT_USER_PROMPT = "[{sender_id},{sender}]: {prompt}";

function documentTitle(source: string, fallback: string): string {
  const heading = source.match(/^#\s+(.+)$/m)?.[1]?.trim();
  return heading || fallback;
}

function characterIdentity(source: string): { name: string; nickNames: string[] } {
  const lines = source.split(/\r?\n/);
  const sectionStart = lines.findIndex((line) => /^#{1,3}\s+角色名\s*$/.test(line));
  const sectionEnd =
    sectionStart < 0
      ? -1
      : lines.findIndex(
          (line, index) => index > sectionStart && /^#{1,3}\s+/.test(line),
        );
  const sectionLines =
    sectionStart < 0
      ? []
      : lines.slice(sectionStart + 1, sectionEnd < 0 ? undefined : sectionEnd);
  const names = sectionLines
    .flatMap((line) =>
      line
        .replace(/^[-*]\s*/, "")
        .replace(/^(?:角色名|名称|触发昵称|昵称)\s*[:：]\s*/, "")
        .split(/[，,、/|]+/),
    )
    .map((value) => value.trim())
    .filter((value) => value && !/填写|在这里/.test(value));
  const fallback =
    documentTitle(source, "我的角色").replace(/(?:伪装|角色)?预设/g, "").trim() ||
    "我的角色";
  const name = (names.find((value) => !value.startsWith("@")) ?? fallback).replace(
    /^@/,
    "",
  );
  return {
    name,
    nickNames: [...new Set([name, ...names, `@${name}`])],
  };
}

function escapeInvalidTemplateBraces(
  source: string,
  context: TemplateEditorContext,
): string {
  const invalidRanges = analyzeTemplate(source, context).filter(
    (range) => range.kind === "error" || range.kind === "unknown",
  );
  let cursor = 0;
  let result = "";
  for (const range of invalidRanges) {
    if (range.from < cursor) continue;
    result += source.slice(cursor, range.from);
    result += escapeTemplateBraces(source.slice(range.from, range.to));
    cursor = range.to;
  }
  return result + source.slice(cursor);
}

function preservedSource(
  source: string,
  context: TemplateEditorContext,
): string {
  return `<user_authored_preset>\n${escapeInvalidTemplateBraces(source, context)}\n</user_authored_preset>`;
}

function buildMainPreset(source: string, format: "markdown" | "koishi"): RawPreset {
  const title = documentTitle(source, "我的主插件预设");
  const formatRules =
    format === "markdown"
      ? `# 回复格式\n使用 Markdown 回复。图片使用 ![描述](https://url)，文件使用 [文件名](https://url)，提及使用 @昵称。不要输出 Koishi 消息元素。`
      : `# 回复格式\n所有可见回复必须完全由连续的 <message>...</message> 组成，标签外不得出现裸文本。图片使用 <img src="https://..."/>，提及使用 <at id="..."/>，文件使用 <file src="https://..."/>。`;
  const assistantExamples =
    format === "markdown"
      ? [{ role: "assistant" as const, content: "我会按照角色设定回复。" }]
      : [
          { role: "assistant" as const, content: "<message>我会按照角色设定回复</message>" },
          { role: "assistant" as const, content: "<message>收到</message>" },
        ];

  return {
    keywords: [title],
    prompts: [
      {
        role: "system",
        content: `# 用户角色设定\n以下内容由用户直接编写，必须完整遵循，不得擅自润色、改写或删减。\n\n${preservedSource(source, "prompt")}\n\n${formatRules}`,
      },
      ...assistantExamples,
    ],
    format_user_prompt: FORMAT_USER_PROMPT,
  };
}

function characterInput(format: "tool-call" | "standard"): string {
  const common = `# 当前时间\n{time}\n\n# 触发原因\n{trigger_reason}\n\n# 最近消息\n{history_new}\n\n# 最后消息\n{history_last}\n\n# 当前状态\n<status>\n{status}\n</status>\n\n# 长期记忆\n{long_memory('guild')}`;
  if (format === "tool-call") {
    return `${common}\n\n# 回复要求\n严格遵循角色设定，结合上下文判断是否回复。需要回复或执行操作时使用 character_reply 工具，不要输出标准格式的操作或消息文本块。`;
  }
  return `${common}\n\n# 输出格式\n<status>\n更新后的状态\n</status>\n\n<think>\n角色视角的思考\n</think>\n\n<action>\n需要执行的操作；没有则留空\n</action>\n\n<output>\n<message>回复内容</message>\n</output>`;
}

function buildCharacterPreset(
  source: string,
  format: "tool-call" | "standard",
): CharacterPresetTemplate {
  const { name, nickNames } = characterIdentity(source);
  const replyRules =
    format === "tool-call"
      ? "回复与操作必须通过 character_reply 工具完成。"
      : "回复必须遵循 input 中的 status、think、action、output、message XML 文本块格式。";
  return {
    name,
    nick_name: nickNames,
    input: characterInput(format),
    system: `# 角色设定\n以下内容由用户直接编写，必须完整遵循，不得擅自润色、改写或删减。\n\n${preservedSource(source, "character-system")}\n\n# 交互规范\n${replyRules}`,
    status: '心情: "平静"\n状态: "正在聊天"\n记忆: ""\n动作: "查看消息"',
    mute_keyword: [],
  };
}

export function buildWorkspacePreset(
  source: string,
  type: WorkspacePresetType,
  format: WorkspaceFormat,
): RawPreset | CharacterPresetTemplate {
  if (type === "main") {
    if (format !== "markdown" && format !== "koishi") {
      throw new Error("主插件预设格式无效");
    }
    return buildMainPreset(source, format);
  }
  if (format !== "tool-call" && format !== "standard") {
    throw new Error("伪装预设格式无效");
  }
  return buildCharacterPreset(source, format);
}

export function serializeWorkspacePreset(
  source: string,
  type: WorkspacePresetType,
  format: WorkspaceFormat,
): string {
  return dump(buildWorkspacePreset(source, type, format), {
    lineWidth: -1,
    noRefs: true,
  });
}

export function workspaceExportFileName(fileName: string): string {
  const base = fileName.replace(/\.(?:md|markdown|ya?ml)$/i, "").trim() || "preset";
  let safe = base
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/[. ]+$/g, "")
    .slice(0, 100);
  if (!safe) safe = "preset";
  if (/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(safe)) safe = `_${safe}`;
  return `${safe}.yml`;
}
