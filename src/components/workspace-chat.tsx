"use client";

import { useCallback, useRef, useState } from "react";
import TextareaAutosize from "react-textarea-autosize";
import { streamText } from "ai";
import {
  ArrowUp,
  BookOpen,
  Bot,
  ChevronDown,
  CircleAlert,
  ExternalLink,
  FileCode2,
  FileText,
  ImageIcon,
  LoaderCircle,
  Paperclip,
  Sparkles,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { MessageResponse } from "@/components/ai-elements/message";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useModelReasoningLevels } from "@/hooks/use-model-reasoning-levels";
import { useWorkspaceChat } from "@/hooks/use-preset";
import { useScopedAIModel } from "@/hooks/use-scoped-ai-model";
import { createLanguageModelFromConfig } from "@/lib/ai/model-provider";
import { isAIModelConfigReady } from "@/lib/ai/model-config";
import { sanitizeAIErrorMessage } from "@/lib/ai/error-sanitize";
import {
  buildChatLunaDocsSystemPrompt,
  retrieveChatLunaDocs,
} from "@/lib/docs-rag";
import { saveWorkspaceChatMessages } from "@/lib/workspace-chat-store";
import type {
  WorkspaceChatAttachment,
  WorkspaceChatMessage,
  WorkspaceChatSource,
} from "@/lib/database";
import {
  AI_PROVIDER_LABELS,
  AI_REASONING_LABELS,
  type AIReasoningLevel,
} from "@/types/ai";
import { toast } from "sonner";

const CHAT_SYSTEM_PROMPT =
  "你是 Easy ChatLuna 助手。回答清晰、直接；涉及预设创作时保留用户给出的原始设定，不擅自改写。";

/** 传给模型的最大上下文轮次（超出则截断旧消息） */
const MAX_CONTEXT_MESSAGES = 20;

const MODEL_DOCS = [
  ["接入 ChatGPT", "https://chatluna.chat/guide/configure-model-platform/openai.html"],
  ["接入 DeepSeek", "https://chatluna.chat/guide/configure-model-platform/deepseek.html"],
  ["接入 Gemini", "https://chatluna.chat/guide/configure-model-platform/google-gemini.html"],
  ["接入 Claude", "https://chatluna.chat/guide/configure-model-platform/claude.html"],
  ["其他模型接入", "https://chatluna.chat/guide/configure-model-platform/introduction.html"],
] as const;

const PRIMARY_DOCS = [
  ["ChatLuna 文档", "https://chatluna.chat/guide/introduction.html"],
  ["Character 伪装文档", "https://chatluna.chat/ecosystem/other/character.html"],
] as const;

const ERROR_CODE_DOC =
  "https://chatluna.chat/guide/faq/error_code.html";

/** 读取文件，返回 WorkspaceChatAttachment */
function readFileAsAttachment(file: File): Promise<WorkspaceChatAttachment> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    const isImage = file.type.startsWith("image/");
    reader.onload = () => {
      resolve({
        name: file.name,
        kind: isImage ? "image" : "text",
        data: reader.result as string,
      });
    };
    reader.onerror = () => reject(reader.error);
    if (isImage) {
      reader.readAsDataURL(file);
    } else {
      reader.readAsText(file, "utf-8");
    }
  });
}

/** 将文本附件内容嵌入消息文本 */
function buildMessageText(text: string, attachments: WorkspaceChatAttachment[]): string {
  const textFiles = attachments.filter((a) => a.kind === "text");
  if (textFiles.length === 0) return text;
  const blocks = textFiles
    .map((a) => `📄 **${a.name}**\n\`\`\`\n${a.data.slice(0, 8000)}\n\`\`\``)
    .join("\n\n");
  return text ? `${blocks}\n\n${text}` : blocks;
}

export function WorkspaceChat({
  conversationId,
  onCreatePreset,
}: {
  conversationId: string;
  onCreatePreset: (type: "main" | "character") => void;
}) {
  const conversation = useWorkspaceChat(conversationId);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const sendingRef = useRef(false);
  const [busyPhase, setBusyPhase] = useState<"retrieving" | "generating" | null>(null);
  const [streamingContent, setStreamingContent] = useState("");
  const [pendingAttachments, setPendingAttachments] = useState<WorkspaceChatAttachment[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const {
    selectedConfig,
    selectionValue,
    options: modelOptions,
    setSelectionValue,
    setReasoning,
  } = useScopedAIModel(`workspace-chat:${conversationId}`);
  const availableReasoningLevels = useModelReasoningLevels(selectedConfig);
  const reasoning = selectedConfig
    ? availableReasoningLevels.includes(selectedConfig.reasoning)
      ? selectedConfig.reasoning
      : availableReasoningLevels.includes("medium")
        ? "medium"
        : availableReasoningLevels[0]
    : undefined;
  const messages = conversation?.messages ?? [];

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    // 重置 input，允许重复选同一文件
    e.target.value = "";
    try {
      const loaded = await Promise.all(files.map(readFileAsAttachment));
      setPendingAttachments((prev) => [...prev, ...loaded]);
    } catch {
      toast.error("文件读取失败");
    }
  }, []);

  const removeAttachment = useCallback((index: number) => {
    setPendingAttachments((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const send = useCallback(async () => {
    const value = input.trim();
    const attachments = pendingAttachments;
    if ((!value && attachments.length === 0) || busy || sendingRef.current || !conversation) return;
    sendingRef.current = true;
    setBusy(true);

    const displayContent = buildMessageText(value, attachments);
    const userMessage: WorkspaceChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: displayContent,
      attachments: attachments.length > 0 ? attachments : undefined,
    };

    try {
      if (!(await saveWorkspaceChatMessages(conversation.id, [userMessage]))) {
        toast.error("消息保存失败，对话可能已被删除");
        return;
      }
      setInput("");
      setPendingAttachments([]);

      if (!isAIModelConfigReady(selectedConfig)) {
        await saveWorkspaceChatMessages(conversation.id, [
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: "请先在设置中配置一个可用模型。",
          },
        ]);
        return;
      }

      setBusyPhase("retrieving");
      // 截断：只取最近 MAX_CONTEXT_MESSAGES 条作为上下文
      const fullHistory = [...conversation.messages, userMessage];
      const contextHistory = fullHistory.slice(-MAX_CONTEXT_MESSAGES);

      const retrievalQuery = contextHistory
        .filter((m) => m.role === "user")
        .slice(-3)
        .map((m) => m.content)
        .join("\n");
      let rag = { context: "", sources: [] as WorkspaceChatSource[], sourceCommit: "" };
      let retrievalWarning: string | undefined;
      try {
        rag = await retrieveChatLunaDocs(retrievalQuery);
      } catch (error) {
        retrievalWarning = error instanceof Error ? error.message : "ChatLuna 文档检索失败";
      }

      setBusyPhase("generating");
      setStreamingContent("");

      // 构建多模态消息列表
      const apiMessages = contextHistory.map((m) => {
        const imageAtts = (m.attachments ?? []).filter((a) => a.kind === "image");
        if (imageAtts.length > 0 && m.role === "user") {
          return {
            role: m.role as "user",
            content: [
              { type: "text" as const, text: m.content },
              ...imageAtts.map((a) => ({ type: "image" as const, image: a.data })),
            ],
          };
        }
        return { role: m.role as "user" | "assistant", content: m.content };
      });

      let accumulated = "";
      const result = streamText({
        model: createLanguageModelFromConfig(selectedConfig),
        reasoning,
        system: `${CHAT_SYSTEM_PROMPT}\n\n${buildChatLunaDocsSystemPrompt(rag)}`,
        messages: apiMessages,
      });

      for await (const delta of result.textStream) {
        accumulated += delta;
        setStreamingContent(accumulated);
      }

      const finalText = accumulated || "模型没有返回内容。";
      setStreamingContent("");
      await saveWorkspaceChatMessages(conversation.id, [
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: finalText,
          sources: rag.sources,
          retrievalWarning,
        },
      ]);
    } catch (error) {
      setStreamingContent("");
      const saved = await saveWorkspaceChatMessages(conversation.id, [
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: `${
            error instanceof Error
              ? sanitizeAIErrorMessage(error.message, selectedConfig?.apiKey)
              : "请求模型失败。"
          }\n\n对照 [ChatLuna 错误码表](${ERROR_CODE_DOC}) 可以定位常见原因。`,
        },
      ]);
      if (!saved) setInput(value);
    } finally {
      sendingRef.current = false;
      setBusy(false);
      setBusyPhase(null);
    }
  }, [busy, conversation, input, pendingAttachments, reasoning, selectedConfig]);

  if (!conversation) {
    return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">正在加载对话</div>;
  }

  return (
    <section className="flex h-full min-h-0 flex-col bg-background">
      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col px-4 py-8 sm:px-6">
          {messages.length === 0 && !streamingContent ? (
            <div className="my-auto pb-16">
              <p className="mb-2 text-sm text-muted-foreground">ChatLuna 工作台</p>
              <h1 className="max-w-2xl text-3xl font-semibold leading-tight sm:text-4xl">
                你好，今天想创建什么？
              </h1>
              <div className="mt-7 flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => onCreatePreset("main")}>
                  <FileCode2 />创建主插件预设
                </Button>
                <Button variant="outline" onClick={() => onCreatePreset("character")}>
                  <Sparkles />创建伪装预设
                </Button>
              </div>
              <nav className="mt-5 flex max-w-3xl flex-wrap gap-x-5 gap-y-2" aria-label="ChatLuna 快速文档">
                {MODEL_DOCS.map(([label, href]) => (
                  <a key={href} href={href} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground hover:underline">
                    {label}<ExternalLink className="size-3" />
                  </a>
                ))}
                {PRIMARY_DOCS.map(([label, href]) => (
                  <a key={href} href={href} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
                    <BookOpen className="size-3.5" />{label}
                  </a>
                ))}
                <a href={ERROR_CODE_DOC} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground hover:underline">
                  <CircleAlert className="size-3.5" />错误码表 / 常见错误
                </a>
              </nav>
            </div>
          ) : (
            <div className="space-y-6 pb-8">
              {messages.map((message) =>
                message.role === "user" ? (
                  <article key={message.id} className="flex flex-col items-end gap-2">
                    {message.attachments?.filter((a) => a.kind === "image").map((att, i) => (
                      <img key={i} src={att.data} alt={att.name}
                        className="max-h-48 max-w-[85%] rounded-xl border object-contain" />
                    ))}
                    <div className="max-w-[85%] whitespace-pre-wrap rounded-3xl bg-muted px-4 py-2.5 text-[15px] leading-7">
                      {message.content}
                    </div>
                  </article>
                ) : (
                  <article key={message.id} className="min-w-0">
                    <MessageResponse className="text-[15px] leading-7">{message.content}</MessageResponse>
                    <SourceList sources={message.sources} />
                    {message.retrievalWarning && (
                      <p className="mt-3 text-xs text-amber-600 dark:text-amber-400">
                        {message.retrievalWarning}，本次回答未使用文档引用。
                      </p>
                    )}
                  </article>
                ),
              )}
              {streamingContent && (
                <article className="min-w-0">
                  <MessageResponse className="text-[15px] leading-7">{streamingContent}</MessageResponse>
                  <span className="mt-1 inline-block h-4 w-0.5 animate-pulse bg-foreground/60" />
                </article>
              )}
              {busy && !streamingContent && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <LoaderCircle className="size-4 animate-spin" />
                  {busyPhase === "retrieving" ? "正在检索 ChatLuna 文档" : "正在生成回答"}
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      <div className="shrink-0 bg-background px-4 pb-4 sm:px-6">
        <div className="mx-auto w-full max-w-3xl rounded-3xl border bg-background shadow-sm transition-shadow focus-within:shadow-md">
          {pendingAttachments.length > 0 && (
            <div className="flex flex-wrap gap-2 px-4 pt-3">
              {pendingAttachments.map((att, i) => (
                <div key={i} className="flex items-center gap-1.5 rounded-full border bg-muted/40 px-2.5 py-1 text-xs">
                  {att.kind === "image"
                    ? <ImageIcon className="size-3 shrink-0 text-muted-foreground" />
                    : <FileText className="size-3 shrink-0 text-muted-foreground" />}
                  <span className="max-w-32 truncate">{att.name}</span>
                  <button type="button" onClick={() => removeAttachment(i)}
                    className="text-muted-foreground hover:text-foreground" aria-label={`移除 ${att.name}`}>
                    <X className="size-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <TextareaAutosize
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); }
            }}
            minRows={1}
            placeholder="输入问题、角色设定或你想实现的效果"
            className="max-h-52 min-h-12 w-full resize-none bg-transparent px-5 pt-4 text-[15px] leading-6 outline-none placeholder:text-muted-foreground"
            aria-label="对话消息"
          />
          <div className="flex items-center justify-between gap-2 px-3 pb-2.5 pt-1">
            <div className="flex items-center gap-1">
              <Button type="button" variant="ghost" size="icon"
                className="size-8 shrink-0 rounded-full text-muted-foreground hover:text-foreground"
                onClick={() => fileInputRef.current?.click()} disabled={busy}
                aria-label="上传文件（txt、yml、图片）" title="上传文件（txt、yml、图片）">
                <Paperclip className="size-4" />
              </Button>
              <input ref={fileInputRef} type="file" accept=".txt,.md,.csv,.json,.yml,.yaml,image/*"
                multiple className="hidden" onChange={handleFileChange} aria-hidden="true" />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" variant="ghost" size="sm"
                    className="h-8 max-w-64 gap-1.5 rounded-full px-3 text-muted-foreground hover:text-foreground">
                    <Bot className="size-4" />
                    <span className="truncate">{selectedConfig?.model || "选择模型"}</span>
                    {reasoning && <span className="shrink-0 text-xs text-muted-foreground">{AI_REASONING_LABELS[reasoning]}</span>}
                    <ChevronDown className="size-3.5 text-muted-foreground" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="max-h-[min(32rem,70vh)] w-72 overflow-y-auto">
                  <DropdownMenuLabel>当前会话模型</DropdownMenuLabel>
                  {modelOptions.length === 0 && (
                    <p className="px-2 py-1.5 text-xs leading-5 text-muted-foreground">
                      还没有可用模型。打开右上角「设置 → AI 模型」新增配置，填入 API Key 后拉取或手动输入模型名。
                    </p>
                  )}
                  <DropdownMenuRadioGroup value={selectionValue} onValueChange={setSelectionValue}>
                    {modelOptions.map((o) => (
                      <DropdownMenuRadioItem key={o.value} value={o.value}>
                        <span className="min-w-0 flex-1 truncate">{o.model}</span>
                        <span className="text-xs text-muted-foreground">{AI_PROVIDER_LABELS[o.provider]}</span>
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                  {availableReasoningLevels.length > 0 && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuLabel>思考等级</DropdownMenuLabel>
                      <DropdownMenuRadioGroup value={reasoning}
                        onValueChange={(v) => setReasoning(v as AIReasoningLevel)}>
                        {availableReasoningLevels.map((level) => (
                          <DropdownMenuRadioItem key={level} value={level}>{AI_REASONING_LABELS[level]}</DropdownMenuRadioItem>
                        ))}
                      </DropdownMenuRadioGroup>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <Button type="button" size="icon" className="size-8 shrink-0 rounded-full"
              disabled={(!input.trim() && pendingAttachments.length === 0) || busy}
              onClick={() => void send()} aria-label="发送" title="发送">
              {busy ? <LoaderCircle className="size-4 animate-spin" /> : <ArrowUp className="size-4" />}
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

function SourceList({ sources }: { sources?: WorkspaceChatSource[] }) {
  if (!sources?.length) return null;
  return (
    <div className="mt-4 border-t pt-3 text-sm">
      <div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <BookOpen className="size-3.5" />参考文档
      </div>
      <div className="space-y-1.5">
        {sources.map((source) => (
          <a key={`${source.index}:${source.sourcePath}:${source.heading}`}
            href={source.url} target="_blank" rel="noopener noreferrer"
            className="flex min-w-0 items-start gap-2 text-primary hover:underline">
            <span className="shrink-0">[{source.index}]</span>
            <span className="min-w-0 flex-1">{source.title}{source.heading !== source.title ? ` · ${source.heading}` : ""}</span>
            <ExternalLink className="mt-1 size-3 shrink-0" />
          </a>
        ))}
      </div>
    </div>
  );
}

