"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { generateText } from "ai";
import { useNavigate } from "react-router";
import {
  Bot,
  Check,
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TemplateEditor } from "@/components/template-editor";
import { SettingsDialog } from "@/components/settings-dialog";
import { Toaster } from "@/components/ui/sonner";
import { useAIModelConfigs } from "@/hooks/use-ai-model-configs";
import { createLanguageModelFromConfig } from "@/lib/ai/model-provider";
import { isAIModelConfigReady } from "@/lib/ai/model-config";
import { sanitizeAIErrorMessage } from "@/lib/ai/error-sanitize";
import {
  WORKSPACE_FORMATS,
  WORKSPACE_STARTERS,
  XIAOKUI_REFERENCES,
  getDefaultFormat,
  type WorkspaceFormat,
  type WorkspacePresetType,
} from "@/lib/preset-workspace-data";
import { cn } from "@/lib/utils";

type WorkspacePane = "outline" | "editor" | "reference" | "assistant";

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

function downloadMarkdown(fileName: string, source: string) {
  const blob = new Blob([source], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName.endsWith(".md") ? fileName : `${fileName}.md`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function PresetWorkspace({ type }: { type: WorkspacePresetType }) {
  const navigate = useNavigate();
  const { activeConfig } = useAIModelConfigs();
  const [format, setFormat] = useState<WorkspaceFormat>(() =>
    getDefaultFormat(type),
  );
  const storageKey = `easy-chatluna:workspace:${type}:${format}`;
  const [source, setSource] = useState(() =>
    localStorage.getItem(storageKey) || WORKSPACE_STARTERS[type],
  );
  const [fileName, setFileName] = useState(
    type === "main" ? "我的主预设.md" : "我的伪装预设.md",
  );
  const [saveState, setSaveState] = useState<"saved" | "saving">("saved");
  const [mobilePane, setMobilePane] = useState<WorkspacePane>("editor");
  const [assistantInput, setAssistantInput] = useState("");
  const [assistantMessages, setAssistantMessages] = useState<string[]>([
    "我会保留你的原始设定，只以补丁形式提供建议。",
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

  useEffect(() => {
    setSource(localStorage.getItem(storageKey) || WORKSPACE_STARTERS[type]);
  }, [storageKey, type]);

  useEffect(() => {
    setSaveState("saving");
    const timeout = window.setTimeout(() => {
      localStorage.setItem(storageKey, source);
      setSaveState("saved");
    }, 450);
    return () => window.clearTimeout(timeout);
  }, [source, storageKey]);

  const addSection = () => {
    setSource((current) => `${current.trimEnd()}\n\n## 新章节\n\n在这里填写内容。\n`);
    setMobilePane("editor");
  };

  const askAssistant = async () => {
    const value = assistantInput.trim();
    if (!value || assistantBusy) return;
    if (!isAIModelConfigReady(activeConfig)) {
      setAssistantMessages((messages) => [
        ...messages,
        `你：${value}`,
        "助手：请先在设置中配置 API Key、Base URL 和模型。",
      ]);
      return;
    }

    setAssistantMessages((messages) => [...messages, `你：${value}`]);
    setAssistantInput("");
    setAssistantBusy(true);

    try {
      const result = await generateText({
        model: createLanguageModelFromConfig(activeConfig),
        maxOutputTokens: 700,
        system:
          "你是 ChatLuna 预设编辑助手。用户文档中的性格、兴趣、聊天风格、聊天行为及其他原始描述必须逐字保留。禁止重写整份文档。只给出可选的局部修改建议，明确插入位置，并使用短小的 Markdown 或 unified diff。没有必要修改时直接说明。",
        prompt: `当前预设格式：${format}\n当前文档：\n---\n${source}\n---\n用户请求：${value}`,
      });
      setAssistantMessages((messages) => [
        ...messages,
        `助手：${result.text || "没有生成可用建议。"}`,
      ]);
    } catch (error) {
      setAssistantMessages((messages) => [
        ...messages,
        `助手：${sanitizeAIErrorMessage(
          error instanceof Error ? error.message : "请求模型失败",
          activeConfig.apiKey,
        )}`,
      ]);
    } finally {
      setAssistantBusy(false);
    }
  };

  const analyzeDocument = async () => {
    if (analysisBusy || assistantBusy) return;
    if (!isAIModelConfigReady(activeConfig)) {
      setAnalysisResult("请先在设置中同步模型列表，并从首页选择当前模型。");
      return;
    }

    const sourceSnapshot = source;
    setAnalysisBusy(true);
    setAnalysisResult("");
    try {
      const result = await generateText({
        model: createLanguageModelFromConfig(activeConfig),
        maxOutputTokens: 1200,
        system:
          "你是 ChatLuna 角色预设评审助手。分析整份预设，不重写用户原文，不虚构用户没有提供的设定。重点判断角色核心是否清楚、性格是否完整且一致、兴趣是否支撑角色、聊天风格和聊天行为是否可执行、各部分是否冲突或重复。输出简洁 Markdown，依次包含：总体判断、性格完整性、行为一致性、缺失或冲突、按优先级排列的优化方向。每条建议必须指出对应章节和具体补充方向。",
        prompt: `预设类型：${type === "main" ? "主插件预设" : "伪装预设"}\n格式：${format}\n请分析以下完整文档：\n\n---\n${sourceSnapshot}\n---`,
      });
      setAnalysisResult(result.text || "模型没有返回分析结果。");
      setAnalysisSource(sourceSnapshot);
    } catch (error) {
      setAnalysisSource(sourceSnapshot);
      setAnalysisResult(
        sanitizeAIErrorMessage(
          error instanceof Error ? error.message : "全文分析失败",
          activeConfig.apiKey,
        ),
      );
    } finally {
      setAnalysisBusy(false);
    }
  };

  return (
    <div className="flex h-screen min-h-0 flex-col overflow-hidden bg-background text-foreground">
      <header className="grid h-12 shrink-0 grid-cols-[1fr_auto_1fr] items-center border-b px-3">
        <button
          type="button"
          className="flex w-fit items-center gap-2 text-sm font-semibold"
          onClick={() => navigate("/")}
        >
          <img
            src={`${import.meta.env.BASE_URL}logo.png`}
            alt="Easy ChatLuna"
            className="size-6 rounded-md object-cover"
          />
          <span className="hidden sm:inline">Easy ChatLuna</span>
        </button>

        <div className="flex min-w-0 items-center gap-2">
          <FileText className="size-3.5 text-muted-foreground" />
          <input
            value={fileName}
            onChange={(event) => setFileName(event.target.value)}
            className="w-44 bg-transparent text-center text-sm font-medium outline-none sm:w-64"
            aria-label="文件名"
          />
        </div>

        <div className="flex items-center justify-end gap-1">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="gap-2"
            onClick={() => downloadMarkdown(fileName, source)}
          >
            <Download className="size-4" />
            <span className="hidden sm:inline">导出</span>
          </Button>
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
            format={format}
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
          />
        </div>

        <div className="h-full min-h-0 lg:hidden">
          {mobilePane === "outline" && (
            <OutlinePane outline={outline} onAdd={addSection} />
          )}
          {mobilePane === "editor" && (
            <EditorPane source={source} onChange={setSource} />
          )}
          {mobilePane === "reference" && <ReferencePane format={format} />}
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
            />
          )}
        </div>
      </main>

      <footer className="flex h-8 shrink-0 items-center justify-between border-t px-3 text-xs text-muted-foreground">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5">
            <span
              className={cn(
                "size-1.5 rounded-full",
                saveState === "saved" ? "bg-emerald-500" : "bg-amber-500",
              )}
            />
            {saveState === "saved" ? "已自动保存" : "保存中"}
          </span>
          <span>{type === "main" ? "主插件预设" : "伪装预设"}</span>
        </div>
        <div className="flex items-center gap-3">
          <Select
            value={format}
            onValueChange={(value) => setFormat(value as WorkspaceFormat)}
          >
            <SelectTrigger className="h-6 w-auto min-w-28 border-0 bg-transparent px-1 text-xs shadow-none">
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end">
              {WORKSPACE_FORMATS[type].map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="hidden sm:inline">
            {missingSections.length === 0
              ? "结构完整"
              : `${missingSections.length} 项建议`}
          </span>
          <span className="max-w-40 truncate">
            {activeConfig?.model || "未选择模型"}
          </span>
        </div>
      </footer>
      <Toaster />
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
  format,
  collapsed = false,
  onToggle,
}: {
  format: WorkspaceFormat;
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
          <ReferenceText value={XIAOKUI_REFERENCES[format]} />
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
}: {
  messages: string[];
  input: string;
  missingSections: string[];
  busy: boolean;
  analysis: string;
  analysisBusy: boolean;
  analysisStale: boolean;
  onInputChange: (value: string) => void;
  onSubmit: () => void;
  onAnalyze: () => void;
}) {
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

        <TabsContent value="chat" className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
            {messages.map((message, index) => (
              <p
                key={`${index}:${message}`}
                className="text-sm leading-6 text-foreground/80"
              >
                {message}
              </p>
            ))}
          </div>
          <div className="border-t p-2">
            <div className="flex items-end gap-1 border bg-background p-1">
              <textarea
                value={input}
                onChange={(event) => onInputChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    onSubmit();
                  }
                }}
                rows={2}
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
              <div className="whitespace-pre-wrap text-sm leading-6 text-foreground/85">
                {analysis}
              </div>
            ) : (
              <p className="text-sm leading-6 text-muted-foreground">
                运行分析后，这里会给出总体性格完整度、设定冲突和按优先级排列的优化方向。
              </p>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </section>
  );
}
