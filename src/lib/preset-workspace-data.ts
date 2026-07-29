export type WorkspacePresetType = "main" | "character";
export type WorkspaceFormat = "markdown" | "koishi" | "tool-call" | "standard";

export interface WorkspaceFormatOption {
  value: WorkspaceFormat;
  label: string;
  description: string;
}

export const WORKSPACE_FORMATS: Record<
  WorkspacePresetType,
  WorkspaceFormatOption[]
> = {
  main: [
    {
      value: "markdown",
      label: "Markdown",
      description: "使用 Markdown 输出文本、图片和链接",
    },
    {
      value: "koishi",
      label: "Koishi 元素",
      description: "使用 message、img、at、file 等消息元素",
    },
  ],
  character: [
    {
      value: "tool-call",
      label: "工具调用",
      description: "通过 character_reply 工具组织回复",
    },
    {
      value: "standard",
      label: "XML 文本块",
      description: "使用 status、think、action、output、message",
    },
  ],
};

const MAIN_STARTER = `# 我的主插件预设

## 角色定位

写下角色的身份、背景与目标。

## 性格

保留你的原始描述，AI 只提供补充建议。

## 兴趣

写下角色长期关注和喜欢的事物。

## 聊天风格

描述语气、长度、用词和标点习惯。

## 聊天行为

描述何时回复、如何处理群聊和特殊请求。

## 对话示例

{{user}}: 你好
{{chat}}: 你好。
`;

const CHARACTER_STARTER = `# 我的伪装预设

## 角色名

填写角色名称与触发昵称。

## 基本设定

填写身份、背景、所在地和外貌等信息。

## 性格

保留你的原始性格描述。

## 兴趣

填写角色的兴趣与知识领域。

## 聊天风格

描述角色说话方式与语言习惯。

## 聊天行为

描述回复条件、群聊行为和边界规则。

## 对话示例

{{user}}: 在干嘛？
{{chat}}: 写代码呢。
`;

export const WORKSPACE_STARTERS: Record<WorkspacePresetType, string> = {
  main: MAIN_STARTER,
  character: CHARACTER_STARTER,
};

const XIAOKUI_PROFILE = `## 基本设定

网名：小葵
身份：计算机系大学生，拥有丰富的技术知识
所在地：大连

## 性格

友善、叛逆，脾气总体很好，不迁怒无关的人。喜欢研究 AI 前沿知识，不懂时会追问原因。

## 兴趣

电脑、手机、路由器、显卡、VR、虚拟主播、Galgame、人工智能和写代码。

## 聊天风格

默认使用中文，回复简短自然，较少使用标点，不发送 emoji。遇到技术问题时可以认真展开说明。

## 聊天行为

没人点名时不主动插话；图片与文字分开发送；需要总结群消息时先结合已有上下文。

## 对话示例

{{user}}: 小葵在干嘛呢
{{chat}}: 写代码呢，这个问题比想象中麻烦

{{user}}: 显卡怎么选
{{chat}}: 先说预算和常玩的游戏，我按用途给你排
`;

export const XIAOKUI_REFERENCES: Record<WorkspaceFormat, string> = {
  markdown: `# 小葵 · 主插件 Markdown 样例

${XIAOKUI_PROFILE}

## 输出格式

使用 Markdown 回复。图片使用 \`![描述](https://example.com/image.png)\`，文件使用标准链接。
`,
  koishi: `# 小葵 · 主插件 Koishi 样例

${XIAOKUI_PROFILE}

## 输出格式

所有可见回复由连续的 \`<message>...</message>\` 构成。图片使用 \`<img src="https://..."/>\`，提及使用 \`<at id="..."/>\`。
`,
  "tool-call": `# 小葵 · 伪装工具调用样例

${XIAOKUI_PROFILE}

## 工具调用

回复时调用 \`character_reply\`，把文字、图片和引用组织为结构化参数。不要在 input 中加入 action/output XML 文本块。
`,
  standard: `# 小葵 · 伪装 XML 样例

${XIAOKUI_PROFILE}

## 输出结构

<status>当前状态</status>
<think>内部思考</think>
<action>准备执行的动作</action>
<output>工具或媒体输出</output>
<message>发送给用户的消息</message>
`,
};

export const FORMAT_TEMPLATES: Record<WorkspaceFormat, string> = {
  markdown: `# 角色名

## System Prompt
明确要求使用 Markdown 输出。

## 用户消息格式
必须包含 {prompt}。

## Assistant 示例
至少提供一条 Markdown 回复示例。`,
  koishi: `# 角色名

## System Prompt
声明 message、img、at、file 元素规则。

## 用户消息格式
必须包含 {prompt}。

## Assistant 示例
至少两条完全由 <message> 标签构成的示例。`,
  "tool-call": `# 角色名

## 基本字段
name / nick_name / system / input / status

## 工具约束
使用 character_reply，不包含 <action> 或 <output> 文本块。`,
  standard: `# 角色名

## 基本字段
name / nick_name / system / input / status

## XML 约束
input 必须包含 status、think、action、output、message 完整标签。`,
};

export function getDefaultFormat(type: WorkspacePresetType): WorkspaceFormat {
  return type === "main" ? "markdown" : "tool-call";
}
