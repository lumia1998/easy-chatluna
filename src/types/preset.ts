export interface RawPreset {
    keywords: string[];
    prompts: BaseMessage[];
    format_user_prompt?: string;
    world_lores?: (WorldLoreConfig | RawWorldLore)[];
    version?: string;
    authors_note?: AuthorsNote;
    knowledge?: KnowledgeConfig;
    config?: {
        longMemoryPrompt?: string;
        loreBooksPrompt?: string;
        longMemoryExtractPrompt?: string;
        longMemoryNewQuestionPrompt?: string;
        postHandler?: PostHandler;
    };
}

export interface RawWorldLore {
    keywords: string | (string | RegExp)[];
    content: string;
    insertPosition?:
        | "before_char_defs"
        | "after_char_defs"
        | "before_scenario"
        | "after_scenario"
        | "before_example_messages"
        | "after_example_messages";
    scanDepth?: number;
    recursiveScan?: boolean;
    maxRecursionDepth?: number;
    matchWholeWord?: boolean;
    constant?: boolean;
    caseSensitive?: boolean;
    enabled?: boolean;
    order?: number;
    tokenLimit?: number;
}

export interface WorldLoreConfig extends RawWorldLore {
    scanDepth?: number;
    tokenLimit?: number;
    recursiveScan?: boolean;
    maxRecursionDepth?: number;
    insertPosition?:
        | "before_char_defs"
        | "after_char_defs"
        | "before_scenario"
        | "after_scenario"
        | "before_example_messages"
        | "after_example_messages";
}

export function isWorldLoreConfig(obj: unknown): obj is WorldLoreConfig {
    return isWorldLore(obj);
}

export function isWorldLore(obj: unknown): obj is RawWorldLore {
    if (!isRecord(obj) || typeof obj.content !== "string") return false;
    const keywordsValid =
        typeof obj.keywords === "string" ||
        (Array.isArray(obj.keywords) &&
            obj.keywords.every(
                (keyword) => typeof keyword === "string" || keyword instanceof RegExp,
            ));
    if (!keywordsValid) return false;

    const positions = new Set([
        "before_char_defs",
        "after_char_defs",
        "before_scenario",
        "after_scenario",
        "before_example_messages",
        "after_example_messages",
    ]);
    if (
        obj.insertPosition !== undefined &&
        (typeof obj.insertPosition !== "string" || !positions.has(obj.insertPosition))
    ) {
        return false;
    }
    return optionalFiniteNumbers(obj, [
        "scanDepth",
        "maxRecursionDepth",
        "order",
        "tokenLimit",
    ]) && optionalBooleans(obj, [
        "recursiveScan",
        "matchWholeWord",
        "constant",
        "caseSensitive",
        "enabled",
    ]);
}

export interface BaseMessage {
    role: "user" | "system" | "assistant";
    type?: "personality" | "description" | "first_message" | "scenario";
    content: string;
}

export interface PostHandler {
    prefix: string;
    postfix: string;
    censor?: boolean;
    variables: Record<string, string>;
}

export interface KnowledgeConfig {
    knowledge: string[] | string;
    prompt?: string;
}

export interface AuthorsNote {
    content: string;
    insertPosition?: "after_char_defs" | "in_chat";
    insertDepth?: number;
    insertFrequency?: number;
}

export function isRawPreset(obj: unknown): obj is RawPreset {
    if (!isRecord(obj) || !isStringArray(obj.keywords)) return false;
    if (
        !Array.isArray(obj.prompts) ||
        !obj.prompts.every((message) => {
            if (!isRecord(message) || typeof message.content !== "string") return false;
            if (!new Set(["user", "system", "assistant"]).has(String(message.role))) {
                return false;
            }
            return message.type === undefined ||
                new Set(["personality", "description", "first_message", "scenario"])
                    .has(String(message.type));
        })
    ) return false;
    if (!optionalStrings(obj, ["format_user_prompt", "version"])) return false;
    if (
        obj.world_lores !== undefined &&
        (!Array.isArray(obj.world_lores) || !obj.world_lores.every(isWorldLore))
    ) return false;
    if (obj.authors_note !== undefined && !isAuthorsNote(obj.authors_note)) return false;
    if (obj.knowledge !== undefined && !isKnowledgeConfig(obj.knowledge)) return false;
    return obj.config === undefined || isPresetConfig(obj.config);
}

export function isCharacterPresetTemplate(obj: unknown): obj is CharacterPresetTemplate {
    if (
        !isRecord(obj) ||
        typeof obj.name !== "string" ||
        typeof obj.input !== "string" ||
        typeof obj.system !== "string" ||
        !isStringArray(obj.nick_name)
    ) return false;
    if (obj.mute_keyword !== undefined && !isStringArray(obj.mute_keyword)) return false;
    return optionalStrings(obj, [
        "status",
        "path",
        "bot_id",
        "owner_id",
        "description",
        "personality",
        "hobbies",
        "dialogue_examples",
        "chat_style",
        "chat_behavior",
        "relationship",
        "stickers",
    ]);
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
    return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function optionalStrings(value: Record<string, unknown>, keys: string[]): boolean {
    return keys.every((key) => value[key] === undefined || typeof value[key] === "string");
}

function optionalBooleans(value: Record<string, unknown>, keys: string[]): boolean {
    return keys.every((key) => value[key] === undefined || typeof value[key] === "boolean");
}

function optionalFiniteNumbers(value: Record<string, unknown>, keys: string[]): boolean {
    return keys.every(
        (key) => value[key] === undefined ||
            (typeof value[key] === "number" && Number.isFinite(value[key])),
    );
}

function isAuthorsNote(value: unknown): value is AuthorsNote {
    if (!isRecord(value) || typeof value.content !== "string") return false;
    if (
        value.insertPosition !== undefined &&
        value.insertPosition !== "after_char_defs" &&
        value.insertPosition !== "in_chat"
    ) return false;
    return optionalFiniteNumbers(value, ["insertDepth", "insertFrequency"]);
}

function isKnowledgeConfig(value: unknown): value is KnowledgeConfig {
    if (!isRecord(value)) return false;
    const knowledgeValid =
        typeof value.knowledge === "string" || isStringArray(value.knowledge);
    return knowledgeValid && optionalStrings(value, ["prompt"]);
}

function isPresetConfig(value: unknown): boolean {
    if (!isRecord(value)) return false;
    if (!optionalStrings(value, [
        "longMemoryPrompt",
        "loreBooksPrompt",
        "longMemoryExtractPrompt",
        "longMemoryNewQuestionPrompt",
    ])) return false;
    if (value.postHandler === undefined) return true;
    if (!isRecord(value.postHandler)) return false;
    if (
        typeof value.postHandler.prefix !== "string" ||
        typeof value.postHandler.postfix !== "string" ||
        !optionalBooleans(value.postHandler, ["censor"]) ||
        !isRecord(value.postHandler.variables)
    ) return false;
    return Object.values(value.postHandler.variables).every(
        (item) => typeof item === "string",
    );
}

export interface CharacterPresetTemplate {
    name: string;
    status?: string;
    nick_name: string[];
    input: string;
    system: string;
    mute_keyword?: string[];
    path?: string;
    bot_id?: string;
    owner_id?: string;
    description?: string;
    personality?: string;
    hobbies?: string;
    dialogue_examples?: string;
    chat_style?: string;
    chat_behavior?: string;
    relationship?: string;
    stickers?: string;
}
