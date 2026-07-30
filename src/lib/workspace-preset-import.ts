import type { CharacterPresetTemplate, RawPreset } from "@/types/preset";
import type { PresetModel } from "@/lib/database";
import type { WorkspaceFormat, WorkspacePresetType } from "./preset-workspace-data";
import { buildWorkspacePreset } from "./workspace-preset-export";

const PRESERVED_PATTERN =
  /<user_authored_preset>\r?\n([\s\S]*?)\r?\n<\/user_authored_preset>/;

/**
 * Recovers the Markdown the user authored in the workspace, if present.
 *
 * The stored text is returned verbatim: `{{` is the template layer's escape for a
 * literal brace, so `{{user}}` in dialogue examples must survive untouched. Export
 * only doubles braces inside invalid template ranges, and that doubling is
 * idempotent, so reopening never drifts further.
 */
function extractPreservedSource(text: string): string | undefined {
  return PRESERVED_PATTERN.exec(text)?.[1];
}

/** Rewrites the H1 title of a workspace document. */
export function renameTitle(source: string, name: string): string {
  return /^#\s+.+$/m.test(source)
    ? source.replace(/^#\s+.+$/m, `# ${name}`)
    : `# ${name}\n\n${source}`;
}

/**
 * Rewrites the `## 角色名` body, keeping any extra aliases the user listed there.
 * Character identity lives in the document, so a rename must edit the document.
 */
function renameCharacterSection(source: string, name: string): string {
  const withTitle = renameTitle(source, name);
  const lines = withTitle.split(/\r?\n/);
  const start = lines.findIndex((line) => /^#{1,3}\s+角色名\s*$/.test(line));
  if (start < 0) return withTitle;
  const end = lines.findIndex(
    (line, index) => index > start && /^#{1,3}\s+/.test(line),
  );
  const bodyEnd = end < 0 ? lines.length : end;
  const aliases = lines
    .slice(start + 1, bodyEnd)
    .join("、")
    .split(/[，,、/|]+/)
    .map((value) => value.trim().replace(/^@/, ""))
    .filter((value) => value && !/填写|在这里/.test(value));
  const kept = aliases.slice(1).filter((value) => value !== name);
  lines.splice(start + 1, bodyEnd - start - 1, "", [name, ...kept].join("、"), "");
  return lines.join("\n");
}

/**
 * Renames a stored preset. When the workspace owns the document, the rename is
 * written into the preserved Markdown so the next save cannot revert it; the rest
 * of the stored preset is left untouched.
 */
export function renamePresetSource(
  model: PresetModel,
  name: string,
): PresetModel["preset"] | undefined {
  const system =
    model.type === "character"
      ? (model.preset as CharacterPresetTemplate).system
      : ((model.preset as RawPreset).prompts?.find(
          (message) => message.role === "system",
        )?.content as string | undefined);
  const preserved =
    typeof system === "string" ? extractPreservedSource(system) : undefined;
  if (!preserved) return undefined;
  const renamed =
    model.type === "character"
      ? renameCharacterSection(preserved, name)
      : renameTitle(preserved, name);
  return applyWorkspaceSource(model, renamed);
}

function section(heading: string, body: string | undefined): string {
  const value = body?.trim();
  return value ? `## ${heading}\n\n${value}\n` : "";
}

/** Rebuilds Markdown from structured character fields for presets not authored here. */
function characterToMarkdown(
  fallbackName: string,
  preset: CharacterPresetTemplate,
): string {
  const name = preset.name?.trim() || fallbackName;
  const aliases = [
    ...new Set(
      (preset.nick_name ?? [])
        .map((value) => value.trim().replace(/^@/, ""))
        .filter((value) => value && value !== name),
    ),
  ];
  const blocks = [
    `# ${name}\n`,
    `## 角色名\n\n${[name, ...aliases].join("、")}\n`,
    section("基本设定", preset.description),
    section("性格", preset.personality),
    section("兴趣", preset.hobbies),
    section("聊天风格", preset.chat_style),
    section("聊天行为", preset.chat_behavior),
    section("人物关系", preset.relationship),
    section("对话示例", preset.dialogue_examples),
  ];
  return blocks.filter(Boolean).join("\n");
}

function mainToMarkdown(name: string, preset: RawPreset): string {
  const systemPrompt = preset.prompts?.find(
    (message) => message.role === "system",
  )?.content;
  const body = typeof systemPrompt === "string" ? systemPrompt.trim() : "";
  return body ? `# ${name}\n\n${body}\n` : `# ${name}\n`;
}

/**
 * Produces the workspace Markdown source for a stored preset. Presets authored in
 * the workspace round-trip exactly; others are reconstructed from their fields.
 */
export function presetToWorkspaceSource(model: PresetModel): string {
  const raw =
    model.type === "character"
      ? (model.preset as CharacterPresetTemplate).system
      : ((model.preset as RawPreset).prompts?.find(
          (message) => message.role === "system",
        )?.content as string | undefined);
  const preserved = typeof raw === "string" ? extractPreservedSource(raw) : undefined;
  if (preserved) return preserved;
  return model.type === "character"
    ? characterToMarkdown(model.name, model.preset as CharacterPresetTemplate)
    : mainToMarkdown(model.name, model.preset as RawPreset);
}

export function workspaceTypeOfPreset(model: PresetModel): WorkspacePresetType {
  return model.type === "character" ? "character" : "main";
}

/** Infers the reply format already encoded in a stored preset. */
export function detectWorkspaceFormat(model: PresetModel): WorkspaceFormat {
  if (model.type === "character") {
    const preset = model.preset as CharacterPresetTemplate;
    return `${preset.input ?? ""}${preset.system ?? ""}`.includes("character_reply")
      ? "tool-call"
      : "standard";
  }
  const prompts = (model.preset as RawPreset).prompts ?? [];
  const joined = prompts
    .map((message) => (typeof message.content === "string" ? message.content : ""))
    .join("\n");
  return joined.includes("<message>") ? "koishi" : "markdown";
}

/**
 * Writes workspace Markdown back into a stored preset, keeping the fields the
 * workspace does not own (status, mute_keyword, world lores, ...) untouched.
 */
export function applyWorkspaceSource(
  model: PresetModel,
  source: string,
): PresetModel["preset"] {
  const format = detectWorkspaceFormat(model);
  const built = buildWorkspacePreset(source, workspaceTypeOfPreset(model), format);
  if (model.type === "character") {
    const current = model.preset as CharacterPresetTemplate;
    const next = built as CharacterPresetTemplate;
    return {
      ...current,
      name: next.name,
      nick_name: next.nick_name,
      system: next.system,
    };
  }
  const current = model.preset as RawPreset;
  const next = built as RawPreset;
  const systemIndex = current.prompts?.findIndex(
    (message) => message.role === "system",
  );
  const nextSystem = next.prompts.find((message) => message.role === "system");
  if (!nextSystem) return current;
  const prompts = [...(current.prompts ?? [])];
  if (systemIndex !== undefined && systemIndex >= 0) {
    prompts[systemIndex] = { ...prompts[systemIndex], content: nextSystem.content };
  } else {
    prompts.unshift(nextSystem);
  }
  // The document title drives the display name (keywords[0]); extra keywords stay.
  const keywords = [...(current.keywords ?? [])];
  const title = next.keywords[0];
  if (title) {
    if (keywords.length === 0) keywords.push(title);
    else keywords[0] = title;
  }
  return { ...current, prompts, keywords };
}
