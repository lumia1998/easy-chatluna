"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import TextareaAutosize from "react-textarea-autosize";
import { generateText } from "ai";
import { useNavigate } from "react-router";
import {
  Bot,
  Check,
  ChevronDown,
  ChevronRight,
  Download,
  FileText,
  ListTree,
  LoaderCircle,
  MessageSquare,
  PanelRight,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  Settings2,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TemplateEditor } from "@/components/template-editor";
import { SettingsDialog } from "@/components/settings-dialog";
import { Toaster } from "@/components/ui/sonner";
import { useModelReasoningLevels } from "@/hooks/use-model-reasoning-levels";
import { useScopedAIModel } from "@/hooks/use-scoped-ai-model";
import { createLanguageModelFromConfig } from "@/lib/ai/model-provider";
import { isAIModelConfigReady } from "@/lib/ai/model-config";
import { sanitizeAIErrorMessage } from "@/lib/ai/error-sanitize";
import {
  WORKSPACE_FORMATS,
  XIAOKUI_REFERENCES,
  getDefaultFormat,
  type WorkspacePresetType,
} from "@/lib/preset-workspace-data";
import {
  serializeWorkspacePreset,
  workspaceExportFileName,
} from "@/lib/workspace-preset-export";
import {
  applyWorkspaceSource,
  presetToWorkspaceSource,
  workspaceTypeOfPreset,
} from "@/lib/workspace-preset-import";
import { mutatePreset } from "@/lib/preset-mutation-queue";
import { usePreset } from "@/hooks/use-preset";
import { MessageResponse } from "@/components/ai-elements/message";
import { cn } from "@/lib/utils";
import {
  AI_PROVIDER_LABELS,
  AI_REASONING_LABELS,
  type AIReasoningLevel,
} from "@/types/ai";
import { toast } from "sonner";

type WorkspacePane = "outline" | "editor" | "reference" | "assistant";

/**
 * Full-document audit prompt. Scoped to identity logic on purpose: tone and
 * output format are applied later by the format templates, so flagging them
 * here would only produce advice the generate step overwrites.
 */
const ANALYSIS_SYSTEM_PROMPT = `# Role: AI 角色预设内容诊断专家 (Character Content Auditor)

## Profile
你是一位专注于 AI 角色人设（Character Identity 与 Logic）逻辑自洽性的审查专家。你的任务是分析用户提供的预设草稿，只从**“人设内容”、“逻辑自洽性”和“维度完整度”**进行深度排查。

你的工作**不是**替用户重写预设，也不是关心语气格式（因为后续会有统一格式模板），而是像一个严谨的剧本编辑，帮用户找出设定上的纰漏，并提出具体修改与补充建议。

---

## 审查核心维度（仅关注内容）

1. **逻辑冲突排查 (Contradictions)**
   - 检查性格、身份、行为模式、喜恶之间是否存在矛盾（例如：一方面说“极度高冷”，另一方面又说“会热心解答陌生人的所有问题”）。
   - 检查背景设定与言行逻辑是否匹配。

2. **核心维度缺失 (Missing Dimensions)**
   - 是否缺少让角色立体的关键要素？（如：情绪触发点/Triggers、价值观动机、处理特定情境时的行为逻辑等）。

3. **人设饱满度与具体度 (Depth 与 Specificity)**
   - 人设描述是仅停留在抽象的形容词堆砌（如“善良”、“叛逆”），还是有具体体现？
   - 是否需要补充具体的细节以增强 AI 在特定场景下的表现？

4. **人设与对话范例的匹配度 (Example Alignment)**
   - 提供的对话范例是否真正体现了前面设定的性格与行为逻辑？范例与人设文本是否存在冲突？

---

## 输出诊断报告要求

请严格按照以下格式输出你的分析结果（注意：**不要直接帮用户重写预设**，只需给出分析与建议）：

### 1. 整体评估与核心结论
- **一句话评价**：（概括当前设定的完成度）
- **核心优化方向**：（简述最需要调整的 1-2 个方向）

### 2. 逻辑矛盾排查（如无矛盾可写无）
- **存在问题**：[指出具体哪两部分设定存在冲突，以及为什么冲突]
- **修改建议**：[建议用户如何调整设定以消除冲突]

### 3. 需要补充/深化的内容维度
- **建议补充的维度**：[指出缺失了哪个维度，例如：情绪触发点、知识/行为边界]
- **具体建议**：[告诉用户应该补充什么方向的具体内容，能让 AI 理解得更透彻]

### 4. 对话范例审查
- **范例匹配度分析**：[分析范例是否契合人设]
- **调整建议**：[如果不匹配，建议用户增加或修改什么场景下的对话范例]`;

interface AssistantMessage {
  role: "user" | "assistant";
  content: string;
}
interface OutlineEntry {
  level: number;
  label: string;
  line: number;
}

const REQUIRED_SECTIONS: Record<WorkspacePresetType, string[]> = {
  main: ["角色定位", "性格", "兴趣", "聊天风格", "聊天行为", "对话示例"],
  character: ["角色名", "基本设定", "性格", "兴趣", "聊天风格", "聊天行为"],
};

function parseOutline(source: string): OutlineEntry[] {
  return source.split("\n").flatMap((line, index) => {
    const match = /^(#{1,3})\s+(.+)$/.exec(line);
    return match
      ? [{ level: match[1].length, label: match[2].trim(), line: index + 1 }]
      : [];
  });
}

function downloadPreset(fileName: string, source: string) {
  const blob = new Blob([source], { type: "text/yaml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = workspaceExportFileName(fileName);
  anchor.click();
  URL.revokeObjectURL(url);
}


/**
 * Opens a stored preset in the Markdown workspace. Edits are written back to the
 * preset record instead of the local draft slot.
 */
export function StoredPresetWorkspace({
  presetId,
  embedded = false,
}: {
  presetId: string;
  embedded?: boolean;
}) {
  const preset = usePreset(presetId);

  if (preset === undefined) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        正在载入预设
      </div>
    );
  }
  if (preset === null) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        预设不存在或已被删除
      </div>
    );
  }

  // `key` pins the mount to this preset, so the child reads these props only in its
  // state initializer — later live-query updates cannot clobber in-flight edits.
  return (
    <PresetWorkspace
      key={presetId}
      type={workspaceTypeOfPreset(preset)}
      embedded={embedded}
      presetId={presetId}
      initialSource={presetToWorkspaceSource(preset)}
      initialFileName={preset.name}
    />
  );
}

function PresetWorkspace({
  type,
  embedded = false,
  presetId,
  initialSource,
  initialFileName,
}: {
  type: WorkspacePresetType;
  embedded?: boolean;
  presetId: string;
  initialSource: string;
  initialFileName: string;
}) {
  const navigate = useNavigate();
  const {
    selectedConfig: assistantConfig,
    selectionValue: assistantModelValue,
    options: assistantModelOptions,
    setSelectionValue: setAssistantModelValue,
    setReasoning: setAssistantReasoning,
  } = useScopedAIModel(`preset-workspace:${presetId}`);
  const reasoningLevels = useModelReasoningLevels(assistantConfig);
  const assistantReasoning = assistantConfig
    ? reasoningLevels.includes(assistantConfig.reasoning)
      ? assistantConfig.reasoning
      : reasoningLevels.includes("medium")
        ? "medium"
        : reasoningLevels[0]
    : undefined;
  const [initialSourceValue] = useState(initialSource);
  const [source, setSource] = useState(initialSource);
  const [fileName, setFileName] = useState(initialFileName);
  const saveErrorShownRef = useRef(false);
  const [mobilePane, setMobilePane] = useState<WorkspacePane>("editor");
  const [assistantInput, setAssistantInput] = useState("");
  const [assistantMessages, setAssistantMessages] = useState<AssistantMessage[]>([
    { role: "assistant", content: "我会保留你的原始设定，只以补丁形式提供建议。" },
  ]);
  const [assistantBusy, setAssistantBusy] = useState(false);
  const [analysisResult, setAnalysisResult] = useState("");
  const [analysisSource, setAnalysisSource] = useState("");
  const [analysisBusy, setAnalysisBusy] = useState(false);
  const [referenceCollapsed, setReferenceCollapsed] = useState(false);

  const outline = useMemo(() => parseOutline(source), [source]);
  const missingSections = useMemo(
    () =>
      REQUIRED_SECTIONS[type].filter(
        (section) => !outline.some((entry) => entry.label.includes(section)),
      ),
    [outline, type],
  );

  // Debounced write-back to the preset record; skipped until the document changes.
  useEffect(() => {
    if (source === initialSourceValue) return;
    const timeout = window.setTimeout(() => {
      void mutatePreset(presetId, (latest) => ({
        preset: applyWorkspaceSource(latest, source),
        changedFields: ["system"],
        message: "已保存工作台内容",
      })).catch(() => {
        if (saveErrorShownRef.current) return;
        saveErrorShownRef.current = true;
        toast.error("预设保存失败，请重试");
      });
    }, 600);
    return () => window.clearTimeout(timeout);
  }, [initialSourceValue, presetId, source]);

  const addSection = () => {
    setSource((current) => `${current.trimEnd()}\n\n## 新章节\n\n在这里填写内容。\n`);
    setMobilePane("editor");
  };

  const askAssistant = async () => {
    const value = assistantInput.trim();
    if (!value || assistantBusy) return;
    if (!isAIModelConfigReady(assistantConfig)) {
      setAssistantMessages((messages) => [
        ...messages,
        { role: "user", content: value },
        {
          role: "assistant",
          content: "请先在设置中配置 API Key、Base URL 和模型。",
        },
      ]);
      return;
    }

    setAssistantMessages((messages) => [
      ...messages,
      { role: "user", content: value },
    ]);
    setAssistantInput("");
    setAssistantBusy(true);

    try {
      const result = await generateText({
        model: createLanguageModelFromConfig(assistantConfig),
        reasoning: assistantReasoning,
        maxOutputTokens: 700,
        system:
          "你是 ChatLuna 预设编辑助手。用户文档中的性格、兴趣、聊天风格、聊天行为及其他原始描述必须逐字保留。禁止重写整份文档。只给出可选的局部修改建议，明确插入位置，并使用短小的 Markdown 或 unified diff。没有必要修改时直接说明。",
        prompt: `当前文档：\n---\n${source}\n---\n用户请求：${value}`,
      });
      setAssistantMessages((messages) => [
        ...messages,
        {
          role: "assistant",
          content: result.text || "没有生成可用建议。",
        },
      ]);
    } catch (error) {
      setAssistantMessages((messages) => [
        ...messages,
        {
          role: "assistant",
          content: sanitizeAIErrorMessage(
            error instanceof Error ? error.message : "请求模型失败",
            assistantConfig.apiKey,
          ),
        },
      ]);
    } finally {
      setAssistantBusy(false);
    }
  };

  const analyzeDocument = async () => {
    if (analysisBusy || assistantBusy) return;
    if (!isAIModelConfigReady(assistantConfig)) {
      setAnalysisResult("请先在设置中配置模型，并为编辑助手选择一个模型。");
      return;
    }

    const sourceSnapshot = source;
    setAnalysisBusy(true);
    setAnalysisResult("");
    try {
      const result = await generateText({
        model: createLanguageModelFromConfig(assistantConfig),
        reasoning: assistantReasoning,
        // The audit report has four required sections; 1200 truncated it mid-report.
        maxOutputTokens: 3000,
        system: ANALYSIS_SYSTEM_PROMPT,
        prompt: `预设类型：${type === "main" ? "主插件预设" : "伪装预设"}\n请分析以下完整文档：\n\n---\n${sourceSnapshot}\n---`,
      });
      setAnalysisResult(result.text || "模型没有返回分析结果。");
      setAnalysisSource(sourceSnapshot);
    } catch (error) {
      setAnalysisSource(sourceSnapshot);
      setAnalysisResult(
        sanitizeAIErrorMessage(
          error instanceof Error ? error.message : "全文分析失败",
          assistantConfig.apiKey,
        ),
      );
    } finally {
      setAnalysisBusy(false);
    }
  };

  return (
    <div className={cn("flex min-h-0 flex-col overflow-hidden bg-background text-foreground", embedded ? "h-full" : "h-screen")}>
      <header className="flex h-12 shrink-0 items-center justify-between gap-3 border-b px-3">
        {!embedded && (
          <button
            type="button"
            className="flex w-fit shrink-0 items-center gap-2 text-sm font-semibold"
            onClick={() => navigate("/")}
          >
            <img
              src={`${import.meta.env.BASE_URL}logo.png`}
              alt="Easy ChatLuna"
              className="size-6 rounded-md object-cover"
            />
            <span className="hidden sm:inline">Easy ChatLuna</span>
          </button>
        )}

        <div className="flex min-w-0 flex-1 items-center gap-2">
          <label
            htmlFor="workspace-file-name"
            className="shrink-0 text-xs text-muted-foreground"
          >
            导出文件名
          </label>
          <input
            id="workspace-file-name"
            value={fileName}
            onChange={(event) => setFileName(event.target.value)}
            className="min-w-0 max-w-56 flex-1 rounded-sm bg-transparent px-1 py-0.5 text-sm outline-none hover:bg-muted focus:bg-muted"
            aria-label="导出文件名"
            placeholder="预设名称"
          />
          <span
            className="shrink-0 text-xs text-muted-foreground"
            aria-hidden="true"
          >
            .yml
          </span>
        </div>

        <div className="flex items-center justify-end gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="gap-2"
                aria-label="导出 YAML"
                title="选择格式并导出 YAML"
              >
                <Download className="size-4" />
                <span className="hidden sm:inline">导出</span>
                <ChevronDown className="size-3.5 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72">
              <DropdownMenuLabel>选择导出格式</DropdownMenuLabel>
              {WORKSPACE_FORMATS[type].map((option) => (
                <DropdownMenuItem
                  key={option.value}
                  className="items-start px-2 py-2"
                  onSelect={() => {
                    try {
                      downloadPreset(
                        fileName,
                        serializeWorkspacePreset(source, type, option.value),
                      );
                    } catch (error) {
                      toast.error(
                        error instanceof Error ? error.message : "导出预设失败",
                      );
                    }
                  }}
                >
                  <Download className="mt-0.5 size-4" />
                  <span className="min-w-0">
                    <span className="block font-medium">{option.label}</span>
                    <span className="block text-xs leading-5 text-muted-foreground">
                      {option.description}
                    </span>
                  </span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          {!embedded && (
            <SettingsDialog
              trigger={
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label="设置"
                  title="设置"
                >
                  <Settings2 className="size-4" />
                </Button>
              }
            />
          )}
        </div>
      </header>

      <div className="flex h-10 shrink-0 items-center justify-between border-b px-3 lg:hidden">
        <div className="flex items-center gap-1">
          {(
            [
              ["outline", ListTree, "大纲"],
              ["editor", FileText, "编辑"],
              ["reference", PanelRight, "参考"],
              ["assistant", Bot, "AI"],
            ] as const
          ).map(([pane, Icon, label]) => (
            <Button
              key={pane}
              type="button"
              variant={mobilePane === pane ? "secondary" : "ghost"}
              size="sm"
              className="gap-1.5"
              onClick={() => setMobilePane(pane)}
            >
              <Icon className="size-3.5" />
              {label}
            </Button>
          ))}
        </div>
      </div>

      <main className="min-h-0 flex-1">
        <div
          className="hidden h-full min-h-0 transition-[grid-template-columns] duration-200 lg:grid"
          style={{
            gridTemplateColumns: referenceCollapsed
              ? "minmax(150px,18fr) minmax(0,64fr) 40px minmax(260px,18fr)"
              : "minmax(150px,18fr) minmax(0,32fr) minmax(0,32fr) minmax(260px,18fr)",
          }}
        >
          <OutlinePane outline={outline} onAdd={addSection} />
          <EditorPane source={source} onChange={setSource} />
          <ReferencePane
            type={type}
            collapsed={referenceCollapsed}
            onToggle={() => setReferenceCollapsed((current) => !current)}
          />
          <AssistantPane
            messages={assistantMessages}
            input={assistantInput}
            missingSections={missingSections}
            busy={assistantBusy}
            analysis={analysisResult}
            analysisBusy={analysisBusy}
            analysisStale={Boolean(analysisResult && analysisSource !== source)}
            onInputChange={setAssistantInput}
            onSubmit={askAssistant}
            onAnalyze={analyzeDocument}
            modelValue={assistantModelValue}
            modelOptions={assistantModelOptions}
            onModelChange={setAssistantModelValue}
            reasoning={assistantReasoning}
            reasoningLevels={reasoningLevels}
            onReasoningChange={setAssistantReasoning}
          />
        </div>

        <div className="h-full min-h-0 lg:hidden">
          {mobilePane === "outline" && (
            <OutlinePane outline={outline} onAdd={addSection} />
          )}
          {mobilePane === "editor" && (
            <EditorPane source={source} onChange={setSource} />
          )}
          {mobilePane === "reference" && <ReferencePane type={type} />}
          {mobilePane === "assistant" && (
            <AssistantPane
              messages={assistantMessages}
              input={assistantInput}
              missingSections={missingSections}
              busy={assistantBusy}
              analysis={analysisResult}
              analysisBusy={analysisBusy}
              analysisStale={Boolean(analysisResult && analysisSource !== source)}
              onInputChange={setAssistantInput}
              onSubmit={askAssistant}
              onAnalyze={analyzeDocument}
              modelValue={assistantModelValue}
              modelOptions={assistantModelOptions}
              onModelChange={setAssistantModelValue}
              reasoning={assistantReasoning}
              reasoningLevels={reasoningLevels}
              onReasoningChange={setAssistantReasoning}
            />
          )}
        </div>
      </main>

      {!embedded && <Toaster />}
    </div>
  );
}

function PaneHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="flex h-9 shrink-0 items-center justify-between border-b px-3 text-xs font-medium text-muted-foreground">
      <span>{title}</span>
      {action}
    </div>
  );
}

function OutlinePane({
  outline,
  onAdd,
}: {
  outline: OutlineEntry[];
  onAdd: () => void;
}) {
  return (
    <section className="flex h-full min-h-0 flex-col border-r bg-muted/15">
      <PaneHeader title="大纲" />
      <nav className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {outline.map((entry, index) => (
          <button
            key={`${entry.line}:${entry.label}`}
            type="button"
            className={cn(
              "flex h-8 w-full items-center gap-1.5 rounded-sm px-2 text-left text-sm hover:bg-muted",
              entry.level === 2 && "pl-5 text-muted-foreground",
              entry.level === 3 && "pl-8 text-xs text-muted-foreground",
              index === 0 && "bg-muted/70 font-medium text-foreground",
            )}
          >
            <ChevronRight className="size-3 shrink-0" />
            <span className="truncate">{entry.label}</span>
          </button>
        ))}
      </nav>
      <button
        type="button"
        onClick={onAdd}
        className="flex h-9 items-center gap-2 border-t px-3 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <Plus className="size-3.5" />
        添加章节
      </button>
    </section>
  );
}

function EditorPane({
  source,
  onChange,
}: {
  source: string;
  onChange: (value: string) => void;
}) {
  return (
    <section className="flex h-full min-h-0 flex-col border-r">
      <PaneHeader title="Markdown 编辑器" />
      <div className="min-h-0 flex-1">
        <TemplateEditor
          value={source}
          onChange={onChange}
          context="generic"
          fillHeight
          markdownToolbar
          minRows={10}
          ariaLabel="预设 Markdown 编辑器"
        />
      </div>
    </section>
  );
}

function ReferencePane({
  type,
  collapsed = false,
  onToggle,
}: {
  type: WorkspacePresetType;
  collapsed?: boolean;
  onToggle?: () => void;
}) {
  return (
    <section className="flex h-full min-h-0 flex-col border-r bg-muted/10">
      <div
        className={cn(
          "flex h-9 shrink-0 items-center border-b",
          collapsed ? "justify-center px-1" : "justify-between px-3",
        )}
      >
        {!collapsed && (
          <span className="text-xs font-medium text-muted-foreground">参考</span>
        )}
        {onToggle && (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            onClick={onToggle}
            aria-label={collapsed ? "展开参考" : "收起参考"}
            title={collapsed ? "展开参考" : "收起参考"}
          >
            {collapsed ? <PanelRightOpen /> : <PanelRightClose />}
          </Button>
        )}
      </div>
      {!collapsed && (
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <ReferenceText value={XIAOKUI_REFERENCES[getDefaultFormat(type)]} />
        </div>
      )}
    </section>
  );
}

function ReferenceText({ value }: { value: string }) {
  return (
    <pre className="whitespace-pre-wrap font-mono text-xs leading-5 text-foreground/75">
      {value}
    </pre>
  );
}

function AssistantPane({
  messages,
  input,
  missingSections,
  busy,
  analysis,
  analysisBusy,
  analysisStale,
  onInputChange,
  onSubmit,
  onAnalyze,
  modelValue,
  modelOptions,
  onModelChange,
  reasoning,
  reasoningLevels,
  onReasoningChange,
}: {
  messages: AssistantMessage[];
  input: string;
  missingSections: string[];
  busy: boolean;
  analysis: string;
  analysisBusy: boolean;
  analysisStale: boolean;
  onInputChange: (value: string) => void;
  onSubmit: () => void;
  onAnalyze: () => void;
  modelValue: string;
  modelOptions: ReturnType<typeof useScopedAIModel>["options"];
  onModelChange: (value: string) => void;
  reasoning: AIReasoningLevel | undefined;
  reasoningLevels: AIReasoningLevel[];
  onReasoningChange: (reasoning: AIReasoningLevel) => void;
}) {
  const selectedModel = modelOptions.find((option) => option.value === modelValue);
  return (
    <section className="flex h-full min-h-0 flex-col bg-muted/5">
      <Tabs defaultValue="chat" className="min-h-0 flex-1 gap-0">
        <div className="flex h-9 shrink-0 items-center border-b px-2">
          <TabsList variant="line" className="h-7">
            <TabsTrigger value="chat" className="gap-1.5 text-xs">
              <MessageSquare className="size-3" />
              对话
            </TabsTrigger>
            <TabsTrigger value="analysis" className="gap-1.5 text-xs">
              <Sparkles className="size-3" />
              分析建议
            </TabsTrigger>
          </TabsList>
        </div>
        {(() => {
          const modelPicker = (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 w-full min-w-0 justify-start gap-1.5 px-2 text-xs"
                aria-label="编辑助手模型与思考等级"
              >
                <span className="truncate">
                  {selectedModel?.model || "选择助手模型"}
                </span>
                {reasoning && (
                  <span className="shrink-0 text-muted-foreground">
                    {AI_REASONING_LABELS[reasoning]}
                  </span>
                )}
                <ChevronDown className="ml-auto size-3 shrink-0 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-72">
              <DropdownMenuLabel>编辑助手模型</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={modelValue} onValueChange={onModelChange}>
                {modelOptions.map((option) => (
                  <DropdownMenuRadioItem key={option.value} value={option.value}>
                    <span className="min-w-0 flex-1 truncate">{option.model}</span>
                    <span className="text-xs text-muted-foreground">
                      {AI_PROVIDER_LABELS[option.provider]}
                    </span>
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
              {reasoningLevels.length > 0 && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel>思考等级</DropdownMenuLabel>
                  <DropdownMenuRadioGroup
                    value={reasoning}
                    onValueChange={(value) =>
                      onReasoningChange(value as AIReasoningLevel)
                    }
                  >
                    {reasoningLevels.map((level) => (
                      <DropdownMenuRadioItem key={level} value={level}>
                        {AI_REASONING_LABELS[level]}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          );
          return (
            <>
        <TabsContent value="chat" className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
            {messages.map((message, index) =>
              message.role === "user" ? (
                <div
                  key={`${index}:${message.content}`}
                  className="flex justify-end"
                >
                  <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl bg-muted px-3 py-1.5 text-sm leading-6">
                    {message.content}
                  </p>
                </div>
              ) : (
                <MessageResponse
                  key={`${index}:${message.content}`}
                  className="min-w-0 text-sm leading-6 text-foreground/80"
                >
                  {message.content}
                </MessageResponse>
              ),
            )}
          </div>
          <div className="border-t p-2">
            <div className="flex items-end gap-1 border bg-background p-1">
              <TextareaAutosize
                value={input}
                onChange={(event) => onInputChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    onSubmit();
                  }
                }}
                minRows={2}
                disabled={busy || analysisBusy}
                placeholder="询问当前文档..."
                className="min-h-12 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm outline-none"
              />
              <Button
                type="button"
                size="icon"
                className="size-8"
                disabled={!input.trim() || busy || analysisBusy}
                onClick={onSubmit}
                aria-label="发送给 AI 助手"
              >
                <Bot className={cn("size-4", busy && "animate-pulse")} />
              </Button>
            </div>
            <div className="mt-1">{modelPicker}</div>
          </div>
        </TabsContent>

        <TabsContent value="analysis" className="min-h-0 overflow-y-auto">
          <div className="sticky top-0 flex h-11 items-center justify-between border-b bg-background/95 px-3 backdrop-blur">
            <span className="text-xs text-muted-foreground">全文角色评估</span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={onAnalyze}
              disabled={analysisBusy || busy}
            >
              {analysisBusy ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <Sparkles />
              )}
              {analysisBusy ? "分析中" : analysis ? "重新分析" : "分析全文"}
            </Button>
          </div>
          <div className="space-y-4 p-3">
            <div className="text-xs leading-5 text-muted-foreground">
              {missingSections.length === 0 ? (
                <span className="flex items-center gap-1.5">
                  <Check className="size-3.5 text-emerald-600" />
                  基础章节齐全
                </span>
              ) : (
                <span>缺少章节：{missingSections.join("、")}</span>
              )}
            </div>
            {analysisStale && (
              <p className="border-l-2 border-amber-500 pl-2 text-xs leading-5 text-muted-foreground">
                文档在上次分析后已修改，请重新分析。
              </p>
            )}
            {analysis ? (
              <MessageResponse className="min-w-0 text-sm leading-6 text-foreground/85">
                {analysis}
              </MessageResponse>
            ) : (
              <p className="text-sm leading-6 text-muted-foreground">
                运行分析后，这里会给出总体性格完整度、设定冲突和按优先级排列的优化方向。
              </p>
            )}
          </div>
        </TabsContent>
            </>
          );
        })()}
      </Tabs>
    </section>
  );
}
