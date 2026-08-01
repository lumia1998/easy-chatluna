import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "./ui/switch";
import {
    RawPreset,
    RawWorldLore,
} from "@/types/preset";
import { GetNestedType, NestedKeyOf } from "@/types/util";
import { Button } from "./ui/button";
import { Plus, Trash2, Code } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { isWorldLore } from "../types/preset";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "./ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/tooltip";
import { TemplateEditor } from "./template-editor";

interface CharacterWorldLoreProps {
    updatePreset?: <K extends NestedKeyOf<RawPreset>>(
        key: K,
        value: GetNestedType<RawPreset, K>
    ) => void;
    preset: RawPreset;
}

export function CharacterWorldLore({
    updatePreset,
    preset,
}: CharacterWorldLoreProps) {
    const [isRegexMap, setIsRegexMap] = useState<Record<string, boolean>>({});

    // 为每条 lore 生成稳定的内容标识（用于 key 和 isRegexMap）
    const getLoreStableId = (lore: RawWorldLore, index: number): string => {
        const firstKeyword = normalizeKeywords(lore.keywords)[0];
        const keywordStr = firstKeyword instanceof RegExp
            ? firstKeyword.source
            : (firstKeyword ?? "");
        // 用内容片段 + fallback index 作为稳定标识
        return `${keywordStr.slice(0, 30)}-${lore.content.slice(0, 20)}-${index}`;
    };

    const WorldLoresItem = (
        lore: RawWorldLore,
        index: number
    ) => {
        const loreId = getLoreStableId(lore, index);

        const handleKeywordDelete = (kidx: number) => {
            if (!isWorldLore(lore)) return;
            const currentKeywords = normalizeKeywords(lore.keywords);
            currentKeywords.splice(kidx, 1);
            updatePreset?.(`world_lores.${index}.keywords`, currentKeywords);
        };

        const handleDeleteLore = () => {
            const lores = [...(preset.world_lores || [])];
            lores.splice(index, 1);
            updatePreset?.("world_lores", lores);
        };

        const handleKeywordChange = (value: string, kidx: number) => {
            if (!isWorldLore(lore)) return;
            const currentKeywords = normalizeKeywords(lore.keywords);
            const key = `${loreId}-${kidx}`;
            if (isRegexMap[key]) {
                try {
                    currentKeywords[kidx] = new RegExp(value);
                } catch {
                    // 非法正则保持字符串，不更新
                    return;
                }
            } else {
                currentKeywords[kidx] = value;
            }
            updatePreset?.(`world_lores.${index}.keywords`, currentKeywords);
        };

        const toggleRegex = (kidx: number) => {
            const key = `${loreId}-${kidx}`;
            setIsRegexMap((prev) => ({
                ...prev,
                [key]: !prev[key],
            }));
        };

        if (!isWorldLore(lore)) return null;

        const firstKeyword = normalizeKeywords(lore.keywords)[0];
        const title =
            firstKeyword instanceof RegExp ? firstKeyword.source : firstKeyword;

        return (
            <Card key={loreId} className="mx-4 mb-4 gap-4 py-4">
                <CardHeader className="flex flex-row items-center justify-between px-4">
                    <CardTitle className="text-lg">
                        {title || "未命名条目"}
                    </CardTitle>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 p-0 hover:bg-destructive/20"
                        onClick={handleDeleteLore}
                    >
                        <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                </CardHeader>
                <CardContent className="space-y-4 px-4">
                    <div className="space-y-2">
                        <Label>触发关键词</Label>
                        <div className="space-y-2 mt-4">
                            {normalizeKeywords(lore.keywords).map(
                                (keyword, kidx) => (
                                    <div
                                        key={`${loreId}-kw-${kidx}`}
                                        className="flex gap-2 items-center"
                                    >
                                        <div className="relative flex-1 flex items-center">
                                            <Input
                                                value={
                                                    keyword instanceof RegExp
                                                        ? keyword.source
                                                        : keyword
                                                }
                                                onChange={(e) =>
                                                    handleKeywordChange(
                                                        e.target.value,
                                                        kidx
                                                    )
                                                }
                                                className="pr-10"
                                            />
                                            <TooltipProvider>
                                                <Tooltip>
                                                    <TooltipTrigger asChild>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className={cn(
                                                                "absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6 p-0",
                                                                isRegexMap[
                                                                    `${loreId}-${kidx}`
                                                                ] &&
                                                                    "bg-primary/20"
                                                            )}
                                                            onClick={() =>
                                                                toggleRegex(
                                                                    kidx
                                                                )
                                                            }
                                                        >
                                                            <Code className="h-3 w-3" />
                                                        </Button>
                                                    </TooltipTrigger>
                                                    <TooltipContent>
                                                        <p>启用正则表达式</p>
                                                    </TooltipContent>
                                                </Tooltip>
                                            </TooltipProvider>
                                        </div>
                                        <Button
                                            aria-label="删除关键词"
                                            title="删除关键词"
                                            variant="ghost"
                                            size="icon"
                                            className="size-8"
                                            onClick={() =>
                                                handleKeywordDelete(kidx)
                                            }
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>
                                )
                            )}
                            <Button
                                variant="outline"
                                className="w-full"
                                onClick={() => {
                                    const currentKeywords = normalizeKeywords(lore.keywords);
                                    updatePreset?.(
                                        `world_lores.${index}.keywords`,
                                        [...currentKeywords, ""]
                                    );
                                }}
                            >
                                <Plus className="h-4 w-4 mr-2" />
                                添加关键词
                            </Button>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor={`world-lore-content-${index}`}>
                            条目内容
                        </Label>
                        <TemplateEditor
                            id={`world-lore-content-${index}`}
                            className="mt-4"
                            placeholder="输入内容"
                            value={lore.content}
                            context="world-lore"
                            minRows={6}
                            ariaLabel={`世界书条目 ${index + 1} 内容`}
                            onChange={(value) => {
                                updatePreset?.(
                                    `world_lores.${index}.content`,
                                    value
                                );
                            }}
                        />
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                            <Label>Token 限制</Label>
                            <Input
                                type="number"
                                className="mt-4"
                                value={lore.tokenLimit ?? 0}
                                onChange={(e) => {
                                    updatePreset?.(
                                        `world_lores.${index}.tokenLimit`,
                                        toFiniteNumber(e.target.value)
                                    );
                                }}
                            />
                        </div>

                        <div className="space-y-2">
                            <Label>扫描深度</Label>
                            <Input
                                type="number"
                                className="mt-4"
                                value={lore.scanDepth || 0}
                                onChange={(e) => {
                                    updatePreset?.(
                                        `world_lores.${index}.scanDepth`,
                                        toFiniteNumber(e.target.value)
                                    );
                                }}
                            />
                        </div>

                        <div className="space-y-2">
                            <Label>最大递归深度</Label>
                            <Input
                                type="number"
                                className="mt-4"
                                value={lore.maxRecursionDepth || 0}
                                onChange={(e) => {
                                    updatePreset?.(
                                        `world_lores.${index}.maxRecursionDepth`,
                                        toFiniteNumber(e.target.value)
                                    );
                                }}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>排序权重</Label>
                            <Input
                                type="number"
                                className="mt-4"
                                value={lore.order ?? 0}
                                onChange={(e) => {
                                    updatePreset?.(
                                        `world_lores.${index}.order`,
                                        toFiniteNumber(e.target.value)
                                    );
                                }}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>插入位置</Label>
                            <Select
                                value={
                                    lore.insertPosition || "before_char_defs"
                                }
                                onValueChange={(value) => {
                                    updatePreset?.(
                                        `world_lores.${index}.insertPosition`,
                                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                        value as any
                                    );
                                }}
                            >
                                <SelectTrigger>
                                    <SelectValue
                                        className="mt-4"
                                        placeholder="选择插入位置"
                                    />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="before_char_defs">
                                        角色定义前
                                    </SelectItem>
                                    <SelectItem value="after_char_defs">
                                        角色定义后
                                    </SelectItem>
                                    <SelectItem value="before_scenario">
                                        场景前
                                    </SelectItem>
                                    <SelectItem value="after_scenario">
                                        场景后
                                    </SelectItem>
                                    <SelectItem value="before_example_messages">
                                        示例消息前
                                    </SelectItem>
                                    <SelectItem value="after_example_messages">
                                        示例消息后
                                    </SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="flex justify-between  items-baseline mt-3">
                            <Label>是否递归扫描</Label>
                            <Switch
                                className="mt-4"
                                checked={lore.recursiveScan || false}
                                onCheckedChange={(checked) => {
                                    updatePreset?.(
                                        `world_lores.${index}.recursiveScan`,
                                        checked
                                    );
                                }}
                            />
                        </div>
                        {([
                            ["enabled", "启用条目", lore.enabled ?? true],
                            ["matchWholeWord", "全词匹配", lore.matchWholeWord ?? false],
                            ["constant", "始终插入", lore.constant ?? false],
                            ["caseSensitive", "区分大小写", lore.caseSensitive ?? false],
                        ] as const).map(([field, label, checked]) => (
                            <div key={field} className="flex items-baseline justify-between mt-3">
                                <Label>{label}</Label>
                                <Switch
                                    className="mt-4"
                                    checked={checked}
                                    onCheckedChange={(value) => {
                                        updatePreset?.(
                                            `world_lores.${index}.${field}`,
                                            value
                                        );
                                    }}
                                />
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>
        );
    };

    return (
        <div className="grid gap-6 sm:grid-cols-1">
            <div>
                <div className="flex flex-row items-center justify-between p-6">
                    <CardTitle>世界书列表</CardTitle>
                    <Button
                        className="size-8"
                        variant="ghost"
                        onClick={() => {
                            const lores = preset.world_lores || [];
                            updatePreset?.("world_lores", [
                                ...lores,
                                {
                                    keywords: [""],
                                    content: "",
                                },
                            ]);
                        }}
                    >
                        <Plus />
                    </Button>
                </div>
                <div>
                    {(Array.isArray(preset.world_lores) ? preset.world_lores : [])
                        .map((lore, originalIndex) => ({ lore, originalIndex }))
                        .filter((item): item is { lore: RawWorldLore; originalIndex: number } =>
                            isWorldLore(item.lore)
                        )
                        .sort((left, right) =>
                            (right.lore.order ?? 0) - (left.lore.order ?? 0) ||
                            left.originalIndex - right.originalIndex
                        )
                        .map(({ lore, originalIndex }) =>
                            WorldLoresItem(lore, originalIndex)
                        )}
                </div>
            </div>
        </div>
    );
}

function normalizeKeywords(keywords: RawWorldLore["keywords"]): (string | RegExp)[] {
    return typeof keywords === "string" ? [keywords] : [...keywords];
}

function toFiniteNumber(value: string): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}
