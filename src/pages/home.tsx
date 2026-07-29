"use client";

import { useMemo, useState, type ComponentType } from "react";
import { useNavigate } from "react-router";
import {
  ArrowUp,
  Bot,
  Box,
  BookOpen,
  ChevronDown,
  FileCode2,
  FolderOpen,
  Gem,
  MessageSquare,
  Paperclip,
  Settings2,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SettingsDialog } from "@/components/settings-dialog";
import { Toaster } from "@/components/ui/sonner";
import { useAIModelConfigs } from "@/hooks/use-ai-model-configs";
import { isAIModelConfigReady } from "@/lib/ai/model-config";
import { AI_PROVIDER_LABELS } from "@/types/ai";

const MODEL_DOCS = [
  {
    label: "接入 ChatGPT",
    href: "https://chatluna.chat/guide/configure-model-platform/openai.html",
    icon: MessageSquare,
  },
  {
    label: "接入 DeepSeek",
    href: "https://chatluna.chat/guide/configure-model-platform/deepseek.html",
    icon: Sparkles,
  },
  {
    label: "接入 Gemini",
    href: "https://chatluna.chat/guide/configure-model-platform/google-gemini.html",
    icon: Gem,
  },
  {
    label: "接入 Claude",
    href: "https://chatluna.chat/guide/configure-model-platform/claude.html",
    icon: Bot,
  },
  {
    label: "其他模型接入",
    href: "https://chatluna.chat/guide/configure-model-platform/introduction.html",
    icon: Box,
  },
] as const;

function openAppPage(path: string) {
  const base = window.location.href.split("#")[0];
  window.open(`${base}#${path}`, "_blank", "noopener,noreferrer");
}

export default function HomePage() {
  const navigate = useNavigate();
  const [prompt, setPrompt] = useState("");
  const {
    configs,
    activeConfig,
    activeConfigId,
    updateConfig,
    setActiveConfigId,
  } = useAIModelConfigs();

  const modelOptions = useMemo(
    () =>
      configs.flatMap((config) => {
        const models = config.availableModels.includes(config.model)
          ? config.availableModels
          : [config.model, ...config.availableModels].filter(Boolean);
        return [...new Set(models)].map((model) => ({ config, model }));
      }),
    [configs],
  );

  const selectedValue = activeConfig
    ? `${activeConfig.id}::${activeConfig.model}`
    : "";

  const selectModel = (value: string) => {
    const [configId, model] = value.split("::");
    if (!configId || !model) return;
    setActiveConfigId(configId);
    updateConfig(configId, { model });
  };

  const submitPrompt = () => {
    const value = prompt.trim();
    if (!value) return;
    if (!isAIModelConfigReady(activeConfig)) {
      toast.error("请先配置可用模型", {
        description: "请先在设置中同步模型列表，再从输入框下方选择模型。",
      });
      return;
    }
    navigate(`/chat?prompt=${encodeURIComponent(value)}`);
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="flex h-14 items-center justify-between border-b px-4 sm:px-6">
        <div className="flex items-center gap-2.5">
          <img
            src={`${import.meta.env.BASE_URL}logo.png`}
            alt="Easy ChatLuna"
            className="size-7 rounded-md object-cover"
          />
          <span className="text-sm font-semibold">Easy ChatLuna</span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="gap-2"
            onClick={() => navigate("/projects")}
          >
            <FolderOpen className="size-4" />
            <span className="hidden sm:inline">项目</span>
          </Button>
          <SettingsDialog
            trigger={
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="设置"
                title="设置"
              >
                <Settings2 className="size-4" />
              </Button>
            }
          />
        </div>
      </header>

      <main className="mx-auto flex min-h-[calc(100vh-3.5rem)] w-full max-w-4xl flex-col justify-center px-4 pb-16 pt-10 sm:px-6">
        <div className="mb-6">
          <p className="mb-2 text-xs font-medium text-muted-foreground">
            CHATLUNA WORKSPACE
          </p>
          <h1 className="text-3xl font-semibold sm:text-4xl">
            你好，今天想创建什么？
          </h1>
        </div>

        <div className="border bg-background shadow-[0_14px_40px_rgba(20,20,18,0.08)]">
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                submitPrompt();
              }
            }}
            rows={5}
            placeholder="输入问题、角色设定或你想实现的效果。Enter 发送，Shift + Enter 换行。"
            className="min-h-36 w-full resize-none bg-transparent px-5 py-4 text-[15px] leading-7 outline-none placeholder:text-muted-foreground/70"
            aria-label="输入消息"
          />
          <div className="flex h-12 items-center justify-between border-t px-3">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label="添加附件"
              title="添加附件"
            >
              <Paperclip className="size-4" />
            </Button>

            <div className="flex items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="max-w-64 gap-2 border bg-muted/30"
                  >
                    <Bot className="size-4" />
                    <span className="truncate">
                      {activeConfig?.model || "选择模型"}
                    </span>
                    <ChevronDown className="size-3.5 text-muted-foreground" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  className="max-h-[min(32rem,70vh)] w-72 overflow-y-auto overscroll-contain [scrollbar-gutter:stable]"
                >
                  <DropdownMenuLabel>当前会话模型</DropdownMenuLabel>
                  <DropdownMenuRadioGroup
                    value={selectedValue}
                    onValueChange={selectModel}
                  >
                    {modelOptions.length > 0 ? (
                      modelOptions.map(({ config, model }) => (
                        <DropdownMenuRadioItem
                          key={`${config.id}:${model}`}
                          value={`${config.id}::${model}`}
                          className="py-2"
                        >
                          <span className="min-w-0 flex-1 truncate">{model}</span>
                          <span className="text-xs text-muted-foreground">
                            {AI_PROVIDER_LABELS[config.provider]}
                          </span>
                        </DropdownMenuRadioItem>
                      ))
                    ) : (
                      <div className="px-2 py-5 text-center text-sm text-muted-foreground">
                        暂无可用模型，请先在设置中添加。
                      </div>
                    )}
                  </DropdownMenuRadioGroup>
                  <DropdownMenuSeparator />
                  <div className="px-2 py-1 text-xs text-muted-foreground">
                    活动配置：{activeConfigId ? activeConfig?.name : "未设置"}
                  </div>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button
                type="button"
                size="icon"
                className="size-9"
                onClick={submitPrompt}
                disabled={!prompt.trim()}
                aria-label="发送"
                title="发送"
              >
                <ArrowUp className="size-4" />
              </Button>
            </div>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <QuickAction
            label="创建主插件预设"
            icon={FileCode2}
            onClick={() => openAppPage("/create/main")}
          />
          <QuickAction
            label="创建伪装预设"
            icon={Sparkles}
            onClick={() => openAppPage("/create/character")}
          />
          <a
            href="https://chatluna.chat/guide"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm transition-colors hover:bg-muted"
          >
            <BookOpen className="size-4 text-emerald-600" />
            查询 ChatLuna 文档
          </a>
        </div>

        <div className="mt-2 flex flex-wrap gap-2">
          {MODEL_DOCS.map(({ label, href, icon: Icon }) => (
            <a
              key={href}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <Icon className="size-4" />
              {label}
            </a>
          ))}
        </div>
      </main>
      <Toaster />
    </div>
  );
}

function QuickAction({
  label,
  icon: Icon,
  onClick,
}: {
  label: string;
  icon: ComponentType<{ className?: string }>;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm transition-colors hover:bg-muted"
    >
      <Icon className="size-4 text-sky-600" />
      {label}
    </button>
  );
}
