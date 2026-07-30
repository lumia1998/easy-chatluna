"use client";

import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  FileCode2,
  Menu,
  MessageSquare,
  PanelLeftClose,
  Pencil,
  Plus,
  Settings2,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { SettingsDialog } from "@/components/settings-dialog";
import { Toaster } from "@/components/ui/sonner";
import { WorkspaceChat } from "@/components/workspace-chat";
import { useMediaQuery } from "@/hooks/use-media-query";
import { usePresets, useWorkspaceChats } from "@/hooks/use-preset";
import {
  createWorkspaceChat,
  deleteWorkspaceChat,
  getOrCreateWorkspaceChat,
} from "@/lib/workspace-chat-store";
import { cn } from "@/lib/utils";
import {
  createWorkspacePreset,
  deletePreset,
  renamePresetData,
} from "@/lib/preset-store";
import { renamePresetSource } from "@/lib/workspace-preset-import";
import { mutatePreset } from "@/lib/preset-mutation-queue";
import { toast } from "sonner";
import type { PresetModel } from "@/lib/database";

const StoredPresetWorkspace = lazy(() =>
  import("@/components/preset-workspace").then((module) => ({
    default: module.StoredPresetWorkspace,
  })),
);

interface WorkbenchTab {
  id: `preset:${string}`;
  kind: "preset";
  presetId: string;
  label: string;
}

const ACTIVE_CONVERSATION_STORAGE_KEY = "easy-chatluna:active-workspace-chat";
const WORKBENCH_TABS_STORAGE_KEY = "easy-chatluna:workbench-tabs";

function readActiveConversationId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_CONVERSATION_STORAGE_KEY);
  } catch {
    return null;
  }
}

function isWorkbenchTab(value: unknown): value is WorkbenchTab {
  if (!value || typeof value !== "object") return false;
  const tab = value as Partial<WorkbenchTab>;
  if (typeof tab.id !== "string" || typeof tab.label !== "string") return false;
  return tab.kind === "preset" && typeof tab.presetId === "string";
}

/** Restores the tab strip so a refresh keeps the open editors in place. */
function readStoredTabs(): { tabs: WorkbenchTab[]; activeTabId: string } {
  try {
    const raw = localStorage.getItem(WORKBENCH_TABS_STORAGE_KEY);
    if (!raw) return { tabs: [], activeTabId: "chat" };
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return { tabs: [], activeTabId: "chat" };
    }
    const store = parsed as {
      tabs?: unknown;
      activeTabId?: unknown;
    };
    const tabs = Array.isArray(store.tabs)
      ? store.tabs.filter(isWorkbenchTab)
      : [];
    const activeTabId =
      typeof store.activeTabId === "string" &&
      (store.activeTabId === "chat" ||
        tabs.some((tab) => tab.id === store.activeTabId))
        ? store.activeTabId
        : "chat";
    return { tabs, activeTabId };
  } catch {
    return { tabs: [], activeTabId: "chat" };
  }
}

export default function HomePage() {
  const presets = usePresets();
  const conversations = useWorkspaceChats();
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const [sidebarOverride, setSidebarOverride] = useState<{
    desktop: boolean;
    open: boolean;
  } | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [tabs, setTabs] = useState<WorkbenchTab[]>(() => readStoredTabs().tabs);
  const [activeTabId, setActiveTabId] = useState<string>(
    () => readStoredTabs().activeTabId,
  );
  const initializedRef = useRef(false);

  // Default to the breakpoint, and drop any manual toggle once it changes so a
  // mobile-collapsed sidebar reopens on desktop.
  const sidebarOpen =
    sidebarOverride && sidebarOverride.desktop === isDesktop
      ? sidebarOverride.open
      : isDesktop;
  const setSidebarOpen = useCallback(
    (next: boolean | ((open: boolean) => boolean)) => {
      setSidebarOverride((current) => {
        const open =
          current && current.desktop === isDesktop ? current.open : isDesktop;
        return {
          desktop: isDesktop,
          open: typeof next === "function" ? next(open) : next,
        };
      });
    },
    [isDesktop],
  );

  useEffect(() => {
    try {
      localStorage.setItem(
        WORKBENCH_TABS_STORAGE_KEY,
        JSON.stringify({ tabs, activeTabId }),
      );
    } catch {
      // Tabs stay usable for the current page lifetime without persistence.
    }
  }, [tabs, activeTabId]);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    void getOrCreateWorkspaceChat(readActiveConversationId()).then(setConversationId);
  }, []);

  useEffect(() => {
    if (!conversationId) return;
    try {
      localStorage.setItem(ACTIVE_CONVERSATION_STORAGE_KEY, conversationId);
    } catch {
      // The selected chat remains usable for the current page lifetime.
    }
  }, [conversationId]);


  const openPresetById = (presetId: string, label: string) => {
    const id = `preset:${presetId}` as const;
    setTabs((current) =>
      current.some((tab) => tab.id === id)
        ? current
        : [...current, { id, kind: "preset", presetId, label }],
    );
    setActiveTabId(id);
    if (!isDesktop) setSidebarOpen(false);
  };

  const createPreset = async (type: "main" | "character") => {
    try {
      const { id, name } = await createWorkspacePreset(type);
      openPresetById(id, name);
      toast.success(`已创建 ${name}`);
    } catch {
      toast.error("创建预设失败");
    }
  };

  const openPreset = (preset: PresetModel) => {
    const id = `preset:${preset.id}` as const;
    setTabs((current) =>
      current.some((tab) => tab.id === id)
        ? current
        : [...current, { id, kind: "preset", presetId: preset.id, label: preset.name }],
    );
    setActiveTabId(id);
    if (!isDesktop) setSidebarOpen(false);
  };

  const closeTab = (id: string) => {
    setTabs((current) => current.filter((tab) => tab.id !== id));
    if (activeTabId === id) setActiveTabId("chat");
  };

  const renamePreset = async (preset: PresetModel, name: string) => {
    try {
      await mutatePreset(preset.id, (latest) => ({
        preset: renamePresetSource(latest, name) ?? renamePresetData(latest, name),
        changedFields: ["name"],
        message: `已重命名为 ${name}`,
      }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "重命名失败");
    }
  };

  const removePreset = async (preset: PresetModel) => {
    try {
      await deletePreset(preset.id);
      closeTab(`preset:${preset.id}`);
      toast.success(`已删除 ${preset.name}`);
    } catch {
      toast.error("删除预设失败");
    }
  };

  const selectConversation = (id: string) => {
    setConversationId(id);
    setActiveTabId("chat");
    if (!isDesktop) setSidebarOpen(false);
  };

  const startConversation = async () => {
    const id = await createWorkspaceChat();
    setConversationId(id);
    setActiveTabId("chat");
    if (!isDesktop) setSidebarOpen(false);
  };

  const removeConversation = async (id: string) => {
    await deleteWorkspaceChat(id);
    if (conversationId !== id) return;
    const remaining = conversations.find((conversation) => conversation.id !== id);
    if (remaining) {
      setConversationId(remaining.id);
      setActiveTabId("chat");
      return;
    }
    await startConversation();
  };

  const activeConversation = conversations.find(
    (conversation) => conversation.id === conversationId,
  );
  return (
    <div className="flex h-screen min-h-0 flex-col overflow-hidden bg-background text-foreground">
      <header className="flex h-12 shrink-0 items-center justify-between border-b px-2 sm:px-3">
        <div className="flex min-w-0 items-center gap-1.5">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setSidebarOpen((open) => !open)}
            aria-label={sidebarOpen ? "收起侧栏" : "展开侧栏"}
            title={sidebarOpen ? "收起侧栏" : "展开侧栏"}
          >
            {sidebarOpen ? <PanelLeftClose /> : <Menu />}
          </Button>
          <img
            src={`${import.meta.env.BASE_URL}logo.png`}
            alt="Easy ChatLuna"
            className="size-6 rounded-md object-cover"
          />
          <span className="truncate text-sm font-semibold">Easy ChatLuna</span>
        </div>
        <SettingsDialog
          trigger={
            <Button type="button" variant="ghost" size="icon" aria-label="设置" title="设置">
              <Settings2 />
            </Button>
          }
        />
      </header>

      <div className="relative flex min-h-0 flex-1">
        {!isDesktop && sidebarOpen && (
          <button
            type="button"
            className="absolute inset-0 z-30 bg-foreground/10 backdrop-blur-[1px]"
            onClick={() => setSidebarOpen(false)}
            aria-label="关闭侧栏"
          />
        )}
        <aside
          className={cn(
            "z-40 grid min-h-0 shrink-0 grid-rows-2 border-r bg-background transition-[width,transform] duration-200",
            isDesktop ? "relative" : "absolute inset-y-0 left-0 shadow-xl",
            sidebarOpen ? "w-64 translate-x-0" : isDesktop ? "w-0 overflow-hidden border-r-0" : "w-64 -translate-x-full",
          )}
        >
          <SidebarFiles
            presets={presets}
            onCreatePreset={createPreset}
            onOpenPreset={openPreset}
            onRenamePreset={renamePreset}
            onDeletePreset={removePreset}
          />
          <SidebarConversations
            conversations={conversations}
            activeId={conversationId}
            onCreate={() => void startConversation()}
            onSelect={selectConversation}
            onRemove={(id) => void removeConversation(id)}
          />
        </aside>

        <section className="flex min-w-0 flex-1 flex-col">
          <nav className="flex h-10 shrink-0 items-end gap-px overflow-x-auto border-b bg-muted/20 px-1 pt-1" aria-label="工作区标签">
            <WorkspaceTabButton
              active={activeTabId === "chat"}
              label={activeConversation?.title || "新对话"}
              icon={<MessageSquare />}
              onClick={() => setActiveTabId("chat")}
            />
            {tabs.map((tab) => (
              <WorkspaceTabButton
                key={tab.id}
                active={activeTabId === tab.id}
                label={
                  presets.find((preset) => preset.id === tab.presetId)?.name ??
                  tab.label
                }
                icon={<FileCode2 />}
                onClick={() => setActiveTabId(tab.id)}
                onClose={() => closeTab(tab.id)}
              />
            ))}
          </nav>

          <div className="relative min-h-0 flex-1 overflow-hidden">
            {conversationId && (
              <div className={cn("absolute inset-0", activeTabId !== "chat" && "hidden")}>
                <WorkspaceChat
                  conversationId={conversationId}
                  onCreatePreset={createPreset}
                />
              </div>
            )}
            {tabs.map((tab) => (
              <div key={tab.id} className={cn("absolute inset-0", activeTabId !== tab.id && "hidden")}>
                <Suspense fallback={<WorkspaceLoading />}>
                  <StoredPresetWorkspace presetId={tab.presetId} embedded />
                </Suspense>
              </div>
            ))}
          </div>
        </section>
      </div>
      <Toaster />
    </div>
  );
}

function WorkspaceLoading() {
  return (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
      正在加载编辑器
    </div>
  );
}

function SidebarFiles({
  presets,
  onCreatePreset,
  onOpenPreset,
  onRenamePreset,
  onDeletePreset,
}: {
  presets: PresetModel[];
  onCreatePreset: (type: "main" | "character") => void;
  onOpenPreset: (preset: PresetModel) => void;
  onRenamePreset: (preset: PresetModel, name: string) => Promise<void>;
  onDeletePreset: (preset: PresetModel) => void;
}) {
  return (
    <section className="flex min-h-0 flex-col border-b">
      <div className="flex h-9 shrink-0 items-center justify-between px-3 text-xs font-medium text-muted-foreground">
        <span>项目</span>
        <div className="flex gap-0.5">
          <Button variant="ghost" size="icon-xs" onClick={() => onCreatePreset("main")} aria-label="新建主插件预设" title="新建主插件预设"><Plus /></Button>
          <Button variant="ghost" size="icon-xs" onClick={() => onCreatePreset("character")} aria-label="新建伪装预设" title="新建伪装预设"><Sparkles /></Button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-2">
        {presets.length === 0 && (
          <p className="px-2 py-3 text-xs leading-5 text-muted-foreground">
            还没有项目。点右上角 + 新建主插件预设，或用星标新建伪装预设。
          </p>
        )}
        {presets.map((preset) => (
          <SidebarPresetItem
            key={preset.id}
            preset={preset}
            onOpen={() => onOpenPreset(preset)}
            onRename={(name) => onRenamePreset(preset, name)}
            onDelete={() => onDeletePreset(preset)}
          />
        ))}
      </div>
    </section>
  );
}

function SidebarConversations({
  conversations,
  activeId,
  onCreate,
  onSelect,
  onRemove,
}: {
  conversations: ReturnType<typeof useWorkspaceChats>;
  activeId: string | null;
  onCreate: () => void;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <section className="flex min-h-0 flex-col">
      <div className="flex h-9 shrink-0 items-center justify-between px-3 text-xs font-medium text-muted-foreground">
        <span>历史对话</span>
        <Button variant="ghost" size="icon-xs" onClick={onCreate} aria-label="新建对话" title="新建对话"><Plus /></Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-2">
        {conversations.map((conversation) => (
          <div key={conversation.id} className={cn("group flex items-center rounded-sm transition-colors hover:bg-muted", conversation.id === activeId && "bg-muted font-medium")}>
            <button type="button" onClick={() => onSelect(conversation.id)} className="flex h-8 min-w-0 flex-1 items-center gap-2 px-2 text-left text-sm">
              <MessageSquare className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate">{conversation.title}</span>
            </button>
            <Button type="button" variant="ghost" size="icon-xs" className="mr-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100" onClick={() => onRemove(conversation.id)} aria-label={`删除对话 ${conversation.title}`} title="删除对话"><X /></Button>
          </div>
        ))}
      </div>
    </section>
  );
}

function SidebarPresetItem({
  preset,
  onOpen,
  onRename,
  onDelete,
}: {
  preset: PresetModel;
  onOpen: () => void;
  onRename: (name: string) => Promise<void>;
  onDelete: () => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(preset.name);

  const commit = async () => {
    const next = draft.trim();
    setRenaming(false);
    if (!next || next === preset.name) {
      setDraft(preset.name);
      return;
    }
    await onRename(next);
  };

  if (renaming) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") void commit();
          if (event.key === "Escape") {
            setDraft(preset.name);
            setRenaming(false);
          }
        }}
        aria-label={`重命名 ${preset.name}`}
        className="h-8 w-full rounded-sm border bg-background px-2 text-sm outline-none"
      />
    );
  }

  return (
    <div className="group flex items-center rounded-sm transition-colors hover:bg-muted">
      <button
        type="button"
        onClick={onOpen}
        className="flex h-8 min-w-0 flex-1 items-center gap-2 px-2 text-left text-sm"
      >
        <span className="[&_svg]:size-3.5 text-muted-foreground">
          <FileCode2 />
        </span>
        <span className="min-w-0 flex-1 truncate">{preset.name}</span>
        <span className="shrink-0 text-[10px] text-muted-foreground group-hover:hidden">
          {preset.type === "main" ? "主插件" : "伪装"}
        </span>
      </button>
      <div className="mr-1 flex shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100">
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          onClick={() => {
            setDraft(preset.name);
            setRenaming(true);
          }}
          aria-label={`重命名 ${preset.name}`}
          title="重命名"
        >
          <Pencil />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          onClick={onDelete}
          aria-label={`删除 ${preset.name}`}
          title="删除"
        >
          <Trash2 />
        </Button>
      </div>
    </div>
  );
}

function WorkspaceTabButton({
  active,
  label,
  icon,
  onClick,
  onClose,
}: {
  active: boolean;
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  onClose?: () => void;
}) {
  return (
    <div className={cn("group flex h-9 min-w-36 max-w-56 items-center border border-b-0 bg-muted/35 text-sm", active && "bg-background")}>
      <button type="button" onClick={onClick} className="flex min-w-0 flex-1 items-center gap-2 px-3" aria-current={active ? "page" : undefined}>
        <span className="[&_svg]:size-3.5 text-muted-foreground">{icon}</span>
        <span className="truncate">{label}</span>
      </button>
      {onClose && (
        <Button type="button" variant="ghost" size="icon-xs" className="mr-1 opacity-60 group-hover:opacity-100" onClick={onClose} aria-label={`关闭 ${label}`} title={`关闭 ${label}`}><X /></Button>
      )}
    </div>
  );
}
