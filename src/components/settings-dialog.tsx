import { Button } from "@/components/ui/button";
import {
    Bot,
    Computer,
    Moon,
    Settings,
    Sun,
} from "lucide-react";
import { cn } from "@/lib/utils";
import React, { useState } from "react";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { useTheme } from "@/hooks/use-theme";
import { useMediaQuery } from "@/hooks/use-media-query";
import { AIModelSettings } from "@/components/ai/ai-model-settings";

interface SettingsCategoryProps {
    title: string;
    icon: React.ReactNode;
    value: string;
}

const settingsCategories: SettingsCategoryProps[] = [
    { title: "通用", icon: <Settings className="h-4 w-4" />, value: "general" },
    { title: "AI 模型", icon: <Bot className="h-4 w-4" />, value: "ai-model" },
];

export function SettingsDialog({
    compact = false,
    trigger,
}: {
    compact?: boolean;
    trigger?: React.ReactNode;
}) {
    const { theme, setTheme } = useTheme();
    const [selectedCategory, setSelectedCategory] = useState(settingsCategories[0].value);
    const isMobile = useMediaQuery('(max-width: 768px)');

    let categoryContent;

    switch (selectedCategory) {
        case "general":
            categoryContent = (
                <div className="grid gap-4 ml-3">
                    <div className="flex items-center justify-between gap-4">
                        <span className="text-sm">主题模式</span>
                        <Select value={theme} onValueChange={setTheme}>
                            <SelectTrigger className="w-[140px]">
                                <SelectValue>
                                    {theme === "light" && "浅色"}
                                    {theme === "dark" && "深色"}
                                    {theme === "system" && "跟随系统"}
                                </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="light">
                                    <div className="flex items-center gap-2">
                                        <Sun className="h-4 w-4" />
                                        <span>浅色</span>
                                    </div>
                                </SelectItem>
                                <SelectItem value="dark">
                                    <div className="flex items-center gap-2">
                                        <Moon className="h-4 w-4" />
                                        <span>深色</span>
                                    </div>
                                </SelectItem>
                                <SelectItem value="system">
                                    <div className="flex items-center gap-2">
                                        <Computer className="size-4" /> 跟随系统
                                    </div>
                                </SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    
                </div>
            );
            break;
        case "ai-model":
            categoryContent = (
                <div className="ml-1 h-full min-h-0">
                    <AIModelSettings />
                </div>
            );
            break;
        default:
            categoryContent = null;
    }


    return (
        <Dialog>
            <DialogTrigger asChild>
                {trigger ?? (
                    <Button
                        variant="ghost"
                        aria-label={compact ? "设置" : undefined}
                        title={compact ? "设置" : undefined}
                        className={cn(
                            "w-full justify-start gap-3 px-4 h-11 rounded-t-lg rounded-b-none border-t hover:bg-primary/5",
                            compact && "justify-center gap-0 px-0"
                        )}
                    >
                        <Settings className="size-5 shrink-0" />
                        <span className={cn(compact && "sr-only")}>设置</span>
                    </Button>
                )}
            </DialogTrigger>
            <DialogContent className={cn(
                "w-[calc(100%-2rem)] max-w-none rounded-2xl sm:max-w-[800px]",
                isMobile
                    ? "max-h-[calc(100vh-2rem)] overflow-y-auto"
                    : "max-h-[calc(100vh-2rem)] overflow-hidden"
            )}>
                <DialogHeader>
                    <DialogTitle>设置</DialogTitle>
                </DialogHeader>
                {isMobile ? (
                    <div className="flex flex-col">
                        <div className="flex flex-row overflow-x-auto pb-4">
                            {settingsCategories.map((category) => (
                                <Button
                                    key={category.value}
                                     variant="ghost"
                                     className={cn(
                                         "flex-shrink-0 w-[120px] justify-start gap-3 px-2 mt-0 h-10 rounded-lg m-1",
                                         selectedCategory === category.value && "bg-primary/10 text-primary hover:bg-primary/20"
                                     )}
                                     onClick={() => setSelectedCategory(category.value)}
                                >
                                    {category.icon}
                                    <span>{category.title}</span>
                                </Button>
                            ))}
                        </div>
                        <div className="flex-1 min-h-0 overflow-y-auto p-4">
                            {categoryContent}
                        </div>
                    </div>
                ) : (
                    <div className="flex h-[min(60vh,32rem)] min-h-0">
                        <div className="w-[200px] border-r flex flex-col pr-6">
                            {settingsCategories.map((category) => (
                                <Button
                                    key={category.value}
                                    variant="ghost"
                                    className={cn(
                                        "w-full justify-start gap-3 px-2 mt-0 h-10 rounded-lg",
                                        selectedCategory === category.value && "bg-primary/10 text-primary hover:bg-primary/20"
                                    )}
                                    onClick={() => setSelectedCategory(category.value)}
                                >
                                    {category.icon}
                                    <span>{category.title}</span>
                                </Button>
                            ))}
                        </div>
                        <div className="flex-1 min-h-0 overflow-y-auto p-4">
                            {categoryContent}
                        </div>
                    </div>
                )}
                <div className="border-t pt-4 mt-4 flex items-center justify-between">
                    <div className="text-xs text-muted-foreground">
                        Easy ChatLuna
                        <br />
                        <a className='text-primary' target="_blank" rel="noreferrer" href='https://github.com/lumia1998/easy-chatluna'>Source</a>
                        {" · "}
                        <a className='text-primary' target="_blank" rel="noreferrer" href='https://github.com/ChatLunaLab/preset-editor'>Upstream</a>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
