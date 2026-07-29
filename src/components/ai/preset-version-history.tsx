"use client";

import { useMemo, useState } from "react";
import { Check, History, RotateCcw } from "lucide-react";
import { dump } from "js-yaml";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { TemplateEditor } from "@/components/template-editor";
import { usePresetVersions } from "@/hooks/use-preset";
import { restorePresetVersion } from "@/lib/preset-mutation-queue";
import type { PresetVersionSource } from "@/lib/database";

const SOURCE_LABELS: Record<PresetVersionSource, string> = {
  initial: "生成前基线",
  "ai-generation": "AI 生成",
  "restore-point": "切换前快照",
};

export function PresetVersionHistory({
  presetId,
  presetType,
  activeVersionId,
}: {
  presetId: string;
  presetType: "main" | "character";
  activeVersionId?: string;
}) {
  const versions = usePresetVersions(presetId);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);

  const effectiveSelectedId =
    selectedId && versions.some((item) => item.id === selectedId)
      ? selectedId
      : activeVersionId && versions.some((item) => item.id === activeVersionId)
        ? activeVersionId
        : versions[0]?.id ?? null;

  const selected = useMemo(
    () => versions.find((item) => item.id === effectiveSelectedId) ?? null,
    [effectiveSelectedId, versions],
  );

  const handleRestore = async () => {
    if (!selected || selected.id === activeVersionId || restoring) return;
    setRestoring(true);
    try {
      await restorePresetVersion(presetId, selected.id);
      toast.success("已切换预设版本", { description: selected.label });
    } catch (error) {
      toast.error("版本切换失败", {
        description: error instanceof Error ? error.message : "未知错误",
      });
    } finally {
      setRestoring(false);
    }
  };

  if (versions.length === 0) {
    return (
      <div className="flex min-h-72 flex-col items-center justify-center gap-3 text-center text-muted-foreground">
        <History className="size-8" />
        <p className="text-sm">首次 AI 生成后会在这里建立版本历史。</p>
      </div>
    );
  }

  return (
    <div className="grid min-h-[34rem] overflow-hidden border lg:grid-cols-[18rem_minmax(0,1fr)]">
      <aside className="max-h-[34rem] overflow-y-auto border-b lg:border-b-0 lg:border-r">
        {versions.map((version) => {
          const isActive = version.id === activeVersionId;
          const isSelected = version.id === effectiveSelectedId;
          return (
            <button
              key={version.id}
              type="button"
              onClick={() => setSelectedId(version.id)}
              className={`flex w-full items-start gap-3 border-b px-4 py-3 text-left transition-colors ${
                isSelected ? "bg-muted" : "hover:bg-muted/60"
              }`}
            >
              <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center">
                {isActive ? (
                  <Check className="size-4 text-emerald-600" />
                ) : (
                  <History className="size-4 text-muted-foreground" />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 text-sm font-medium">
                  <span className="truncate">{version.label}</span>
                  {isActive && (
                    <span className="shrink-0 text-xs text-emerald-600">当前</span>
                  )}
                </span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  {SOURCE_LABELS[version.source]} · {formatVersionTime(version.createdAt)}
                </span>
              </span>
            </button>
          );
        })}
      </aside>

      <section className="min-w-0 p-4">
        {selected && (
          <>
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <h3 className="truncate text-sm font-semibold">{selected.label}</h3>
                <p className="text-xs text-muted-foreground">
                  revision {selected.revision} · {formatVersionTime(selected.createdAt)}
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                onClick={handleRestore}
                disabled={restoring || selected.id === activeVersionId}
              >
                {selected.id === activeVersionId ? (
                  <Check className="size-4" />
                ) : (
                  <RotateCcw className="size-4" />
                )}
                {selected.id === activeVersionId ? "当前版本" : "切换到此版本"}
              </Button>
            </div>
            <TemplateEditor
              value={dump(selected.preset, { lineWidth: -1 })}
              context={presetType === "main" ? "main-preset" : "character-preset"}
              minRows={25}
              readOnly
              ariaLabel="历史版本原文预览"
            />
          </>
        )}
      </section>
    </div>
  );
}

function formatVersionTime(value: number): string {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(value);
}
