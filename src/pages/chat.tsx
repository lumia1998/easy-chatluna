"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { generateText } from "ai";
import { useNavigate, useSearchParams } from "react-router";
import {
  ArrowLeft,
  ArrowUp,
  BookOpen,
  Bot,
  ChevronDown,
  ExternalLink,
  LoaderCircle,
  Settings2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SettingsDialog } from "@/components/settings-dialog";
import { useAIModelConfigs } from "@/hooks/use-ai-model-configs";
import { createLanguageModelFromConfig } from "@/lib/ai/model-provider";
import { isAIModelConfigReady } from "@/lib/ai/model-config";
import { AI_PROVIDER_LABELS } from "@/types/ai";
import {
  buildChatLunaDocsSystemPrompt,
  retrieveChatLunaDocs,
  type ChatLunaRagSource,
} from "@/lib/docs-rag";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  sources?: ChatLunaRagSource[];
  retrievalWarning?: string;
};

const CHAT_SYSTEM_PROMPT =
  "你是 Easy ChatLuna 助手。回答清晰、直接；涉及预设创作时保留用户给出的原始设定，不擅自改写。";

export default function ChatPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialPrompt = searchParams.get("prompt")?.trim() || "";
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [busyPhase, setBusyPhase] = useState<"retrieving" | "generating" | null>(
    null,
  );
  const [initialSent, setInitialSent] = useState(false);
  const { configs, activeConfig, setActiveConfigId, updateConfig } =
    useAIModelConfigs();

  const modelOptions = useMemo(
    () =>
      configs.flatMap((config) =>
        [...new Set([config.model, ...config.availableModels].filter(Boolean))].map(
          (model) => ({ config, model }),
        ),
      ),
    [configs],
  );

  const send = useCallback(async (rawValue: string) => {
    const value = rawValue.trim();
    if (!value || busy) return;
    if (!isAIModelConfigReady(activeConfig)) {
      setInput("");
      setMessages((current) => [
        ...current,
        { role: "user", content: value },
        { role: "assistant", content: "请先在设置中配置一个可用模型。" },
      ]);
      return;
    }

    const history = [...messages, { role: "user" as const, content: value }];
    setMessages(history);
    setInput("");
    setBusy(true);
    try {
      setBusyPhase("retrieving");
      const retrievalQuery = history
        .filter((message) => message.role === "user")
        .slice(-3)
        .map((message) => message.content)
        .join("\n");
      let rag = {
        context: "",
        sources: [] as ChatLunaRagSource[],
        sourceCommit: "",
      };
      let retrievalWarning: string | undefined;
      try {
        rag = await retrieveChatLunaDocs(retrievalQuery);
      } catch (error) {
        retrievalWarning =
          error instanceof Error ? error.message : "ChatLuna 文档检索失败";
      }

      setBusyPhase("generating");
      const result = await generateText({
        model: createLanguageModelFromConfig(activeConfig),
        system: `${CHAT_SYSTEM_PROMPT}\n\n${buildChatLunaDocsSystemPrompt(rag)}`,
        messages: history.map((message) => ({
          role: message.role,
          content: message.content,
        })),
      });
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          content: result.text || "模型没有返回内容。",
          sources: rag.sources,
          retrievalWarning,
        },
      ]);
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          content: error instanceof Error ? error.message : "请求模型失败。",
        },
      ]);
    } finally {
      setBusy(false);
      setBusyPhase(null);
    }
  }, [activeConfig, busy, messages]);

  useEffect(() => {
    if (!initialSent && initialPrompt) {
      setInitialSent(true);
      void send(initialPrompt);
    }
  }, [initialPrompt, initialSent, send]);

  return (
    <div className="flex h-screen min-h-0 flex-col bg-background text-foreground">
      <header className="flex h-12 shrink-0 items-center justify-between border-b px-3">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="返回首页"
          title="返回首页"
          onClick={() => navigate("/")}
        >
          <ArrowLeft className="size-4" />
        </Button>
        <span className="text-sm font-medium">新对话</span>
        <SettingsDialog
          trigger={
            <Button type="button" variant="ghost" size="icon" aria-label="设置" title="设置">
              <Settings2 className="size-4" />
            </Button>
          }
        />
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col px-4 py-8 sm:px-6">
          {messages.length === 0 ? (
            <div className="m-auto text-center text-sm text-muted-foreground">
              输入消息开始对话
            </div>
          ) : (
            <div className="space-y-7 pb-8">
              {messages.map((message, index) => (
                <article key={`${index}:${message.role}`} className="grid grid-cols-[28px_1fr] gap-3">
                  <div className="flex size-7 items-center justify-center rounded-md border bg-muted/40 text-xs font-medium">
                    {message.role === "assistant" ? <Bot className="size-3.5" /> : "你"}
                  </div>
                  <div className="whitespace-pre-wrap pt-0.5 text-[15px] leading-7">
                    {message.content}
                    {message.role === "assistant" && message.sources?.length ? (
                      <div className="mt-4 border-t pt-3 text-sm">
                        <div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
                          <BookOpen className="size-3.5" />
                          参考文档
                        </div>
                        <div className="space-y-1.5">
                          {message.sources.map((source) => (
                            <a
                              key={`${source.index}:${source.sourcePath}:${source.heading}`}
                              href={source.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex min-w-0 items-start gap-2 text-primary hover:underline"
                            >
                              <span className="shrink-0">[{source.index}]</span>
                              <span className="min-w-0 flex-1">
                                {source.title}
                                {source.heading !== source.title
                                  ? ` · ${source.heading}`
                                  : ""}
                              </span>
                              <ExternalLink className="mt-1 size-3 shrink-0" />
                            </a>
                          ))}
                        </div>
                        <a
                          href={message.sources[0].provenanceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                        >
                          ChatLunaLab/doc · CC BY-SA 4.0
                          <ExternalLink className="size-3" />
                        </a>
                      </div>
                    ) : null}
                    {message.role === "assistant" && message.retrievalWarning && (
                      <p className="mt-3 text-xs text-amber-600 dark:text-amber-400">
                        {message.retrievalWarning}，本次回答未使用文档引用。
                      </p>
                    )}
                  </div>
                </article>
              ))}
              {busy && (
                <div className="grid grid-cols-[28px_1fr] gap-3 text-muted-foreground">
                  <div className="flex size-7 items-center justify-center rounded-md border bg-muted/40">
                    <Bot className="size-3.5" />
                  </div>
                  <div className="flex items-center gap-2 pt-1 text-sm">
                    <LoaderCircle className="size-4 animate-spin" />
                    {busyPhase === "retrieving"
                      ? "正在检索 ChatLuna 文档"
                      : "正在生成回答"}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      <div className="shrink-0 border-t bg-background px-4 py-3">
        <div className="mx-auto w-full max-w-3xl border bg-background">
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void send(input);
              }
            }}
            rows={2}
            placeholder="输入消息..."
            className="min-h-16 w-full resize-none bg-transparent px-4 py-3 text-sm leading-6 outline-none"
            aria-label="对话消息"
          />
          <div className="flex h-10 items-center justify-between border-t px-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="ghost" size="sm" className="max-w-64 gap-2">
                  <Bot className="size-4" />
                  <span className="truncate">{activeConfig?.model || "选择模型"}</span>
                  <ChevronDown className="size-3.5 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                className="max-h-[min(32rem,70vh)] w-72 overflow-y-auto overscroll-contain [scrollbar-gutter:stable]"
              >
                <DropdownMenuLabel>当前会话模型</DropdownMenuLabel>
                <DropdownMenuRadioGroup
                  value={activeConfig ? `${activeConfig.id}::${activeConfig.model}` : ""}
                  onValueChange={(value) => {
                    const [configId, model] = value.split("::");
                    if (!configId || !model) return;
                    setActiveConfigId(configId);
                    updateConfig(configId, { model });
                  }}
                >
                  {modelOptions.map(({ config, model }) => (
                    <DropdownMenuRadioItem key={`${config.id}:${model}`} value={`${config.id}::${model}`}>
                      <span className="min-w-0 flex-1 truncate">{model}</span>
                      <span className="text-xs text-muted-foreground">{AI_PROVIDER_LABELS[config.provider]}</span>
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              type="button"
              size="icon"
              className="size-8"
              disabled={!input.trim() || busy}
              onClick={() => void send(input)}
              aria-label="发送"
              title="发送"
            >
              <ArrowUp className="size-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
