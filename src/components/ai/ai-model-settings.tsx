"use client";

import { Button } from "@/components/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAIModelConfigs } from "@/hooks/use-ai-model-configs";
import { fetchAIModelIds } from "@/lib/ai/model-list";
import { sanitizeAIErrorMessage } from "@/lib/ai/error-sanitize";
import {
  AI_MODEL_SECRET_PERSISTENCE_ERROR_EVENT,
  AI_PROVIDER_LABELS,
  type AIProviderFormat,
} from "@/types/ai";
import {
  CircleHelp,
  Eye,
  EyeOff,
  LoaderCircle,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

const PROVIDERS: AIProviderFormat[] = ["openai", "anthropic", "google"];

export function AIModelSettings() {
  const {
    configs,
    addConfig,
    deleteConfig,
    updateConfig,
  } = useAIModelConfigs();
  const [showApiKey, setShowApiKey] = useState(false);
  const [loadingConfigId, setLoadingConfigId] = useState<string | null>(null);
  const [editingConfigId, setEditingConfigId] = useState<string | null>(null);

  const selected =
    configs.find((config) => config.id === editingConfigId) ?? configs[0] ?? null;
  const models = selected?.availableModels ?? [];

  useEffect(() => {
    const handlePersistenceError = () =>
      toast.error("API Key 加密保存失败", {
        description: "请不要刷新页面，检查浏览器存储权限后重试。",
      });
    window.addEventListener(
      AI_MODEL_SECRET_PERSISTENCE_ERROR_EVENT,
      handlePersistenceError,
    );
    return () =>
      window.removeEventListener(
        AI_MODEL_SECRET_PERSISTENCE_ERROR_EVENT,
        handlePersistenceError,
      );
  }, []);

  const handleFetchModels = async () => {
    if (!selected) {
      return;
    }

    setLoadingConfigId(selected.id);
    try {
      const nextModels = await fetchAIModelIds(selected);
      updateConfig(selected.id, {
        availableModels: nextModels,
        ...(selected.model.trim() || nextModels.length === 0
          ? {}
          : { model: nextModels[0] }),
      });
      if (nextModels.length === 0) {
        toast.warning("接口未返回可用模型");
      } else {
        toast.success("模型列表已更新");
      }
    } catch (error) {
      toast.error(
        error instanceof Error
          ? sanitizeAIErrorMessage(error.message, selected.apiKey)
          : "拉取模型失败",
      );
    } finally {
      setLoadingConfigId(null);
    }
  };

  return (
    <div className="flex min-h-0 flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">AI 模型配置</p>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="shrink-0 gap-1"
          onClick={() => setEditingConfigId(addConfig("openai"))}
        >
          <Plus className="h-4 w-4" />
          新增
        </Button>
      </div>

      {configs.length === 0 ? (
        <div className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
          尚未添加模型配置。点击「新增」创建第一条。
        </div>
      ) : (
        selected && (
          <div className="space-y-3">
            <div className="grid gap-2">
              <Label>配置</Label>
              <div className="flex gap-2">
                <Select
                  value={selected.id}
                  onValueChange={setEditingConfigId}
                >
                  <SelectTrigger className="min-w-0 flex-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {configs.map((config) => (
                      <SelectItem key={config.id} value={config.id}>
                        {config.name || "未命名配置"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="shrink-0 text-destructive hover:text-destructive"
                  aria-label="删除配置"
                  title="删除配置"
                  onClick={() => {
                    const nextConfig = configs.find(
                      (config) => config.id !== selected.id,
                    );
                    setEditingConfigId(nextConfig?.id ?? null);
                    deleteConfig(selected.id);
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="ai-config-name">名称</Label>
              <Input
                id="ai-config-name"
                value={selected.name}
                onChange={(event) =>
                  updateConfig(selected.id, { name: event.target.value })
                }
                placeholder="例如：工作站 OpenAI"
              />
            </div>

            <div className="grid gap-2">
              <Label>提供商</Label>
              <Select
                value={selected.provider}
                onValueChange={(value) => {
                  updateConfig(selected.id, {
                    provider: value as AIProviderFormat,
                    model: "",
                    availableModels: [],
                  });
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROVIDERS.map((provider) => (
                    <SelectItem key={provider} value={provider}>
                      {AI_PROVIDER_LABELS[provider]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="ai-config-key">API Key</Label>
              <InputGroup>
                <InputGroupInput
                  id="ai-config-key"
                  type={showApiKey ? "text" : "password"}
                  value={selected.apiKey}
                  onChange={(event) => {
                    updateConfig(selected.id, {
                      apiKey: event.target.value,
                    });
                  }}
                  placeholder="请输入 API Key"
                  autoComplete="new-password"
                />
                <InputGroupAddon align="inline-end">
                  <InputGroupButton
                    size="icon-xs"
                    aria-label={showApiKey ? "隐藏 API Key" : "显示 API Key"}
                    title={showApiKey ? "隐藏 API Key" : "显示 API Key"}
                    onClick={() => setShowApiKey((visible) => !visible)}
                  >
                    {showApiKey ? <EyeOff /> : <Eye />}
                  </InputGroupButton>
                </InputGroupAddon>
              </InputGroup>
              <p className="text-xs leading-5 text-muted-foreground">
                API Key 会在此浏览器中加密保存，刷新、切换标签页或重新打开后仍可使用。
              </p>
            </div>

            <div className="grid gap-2">
              <div className="flex items-center gap-1.5">
                <Label htmlFor="ai-config-base">Base URL</Label>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className="text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        aria-label="Base URL 说明"
                      >
                        <CircleHelp className="size-3.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent
                      className="max-w-80 border bg-popover text-popover-foreground shadow-md"
                      sideOffset={6}
                    >
                      API 服务的基础地址。静态网页直连官方 API
                      可能受浏览器跨域策略限制；遇到 CORS
                      错误时，请使用支持跨域的代理地址。
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <Input
                id="ai-config-base"
                value={selected.baseUrl}
                onChange={(event) => {
                    updateConfig(selected.id, {
                      baseUrl: event.target.value,
                      model: "",
                      availableModels: [],
                    });
                }}
                placeholder="API Base URL"
              />
            </div>

            <div className="grid gap-2 border-t pt-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <Label htmlFor="ai-config-model">使用的模型</Label>
                  {models.length > 0 && (
                    <span className="truncate text-xs text-muted-foreground">
                      已获取 {models.length} 个
                    </span>
                  )}
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 shrink-0 gap-1 px-2 text-xs"
                  disabled={loadingConfigId === selected.id}
                  onClick={handleFetchModels}
                >
                  {loadingConfigId === selected.id ? (
                    <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5" />
                  )}
                  拉取模型
                </Button>
              </div>
              <Input
                id="ai-config-model"
                list="ai-config-model-options"
                value={selected.model}
                onChange={(event) =>
                  updateConfig(selected.id, { model: event.target.value })
                }
                placeholder="手动输入模型名，例如 gpt-4o"
              />
              <datalist id="ai-config-model-options">
                {models.map((model) => (
                  <option key={model} value={model} />
                ))}
              </datalist>
              <p className="text-xs leading-5 text-muted-foreground">
                接口不支持模型列表时，可直接手动填写模型名。填好的模型会出现在首页和对话输入框下方的切换菜单里。
              </p>
            </div>
          </div>
        )
      )}
    </div>
  );
}
