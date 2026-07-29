import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    createCharacterPreset,
    createMainPreset,
} from "@/lib/preset-store";

export function NewPresetDialog() {
    const [open, setOpen] = useState(false);
    const [name, setName] = useState("");
    const [type, setType] = useState("main");
    const [error, setError] = useState("");
    const [creating, setCreating] = useState(false);

    const handleCreatePreset = async () => {
        if (!name.trim()) {
            setError("请输入预设名称");
            return;
        }

        setError("");
        setCreating(true);
        try {
            if (type === "main") {
                await createMainPreset(name.trim());
            } else {
                await createCharacterPreset(name.trim());
            }
            setName("");
            setType("main");
            setOpen(false);
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "创建预设失败");
        } finally {
            setCreating(false);
        }
    };
    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="default" className="flex-1 md:flex-none">
                    <Plus className="w-4 h-4 md:mr-0 md:w-auto md:h-auto" />

                    <span className="hidden md:inline">新建预设</span>
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-[90vw] sm:max-w-[90vw] md:max-w-[425px] rounded-2xl">
                <DialogHeader>
                    <DialogTitle>新建预设</DialogTitle>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="grid gap-2">
                        <label htmlFor="name" className="text-sm">
                            名称
                        </label>
                        <Input
                            id="name"
                            value={name}
                            onChange={(e) => {
                                setName(e.target.value);
                                setError("");
                            }}
                            className={error ? "border-red-500" : ""}
                        />
                        {error && <span className="text-sm text-red-500">{error}</span>}
                    </div>
                    <div className="grid gap-2">
                        <label htmlFor="type" className="text-sm">
                            类型
                        </label>
                        <Select
                            value={type}
                            defaultValue="character"
                            onValueChange={setType}
                        >
                            <SelectTrigger className="w-[180px]">
                                <SelectValue placeholder="选择预设类型" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="main">
                                    ChatLuna 预设
                                </SelectItem>
                                <SelectItem value="character">
                                    ChatLuna 伪装预设
                                </SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>
                <Button onClick={handleCreatePreset} disabled={creating}>
                    {creating ? "创建中..." : "创建"}
                </Button>
            </DialogContent>
        </Dialog>
    );
}
