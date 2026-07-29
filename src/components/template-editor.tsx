import {
  useEffect,
  useRef,
  type ComponentProps,
  type MouseEvent,
} from "react";
import { basicSetup } from "codemirror";
import {
  autocompletion,
  snippetCompletion,
  type Completion,
  type CompletionContext,
} from "@codemirror/autocomplete";
import { linter, type Diagnostic } from "@codemirror/lint";
import { Compartment, EditorState } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  placeholder as codeMirrorPlaceholder,
  ViewPlugin,
  type ViewUpdate,
} from "@codemirror/view";
import {
  Bold,
  Braces,
  Code2,
  Heading1,
  Heading2,
  Heading3,
  Image,
  Italic,
  Link,
  List,
  Quote,
  Strikethrough,
  Underline,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/hooks/use-theme";
import {
  analyzeTemplate,
  escapeTemplateBraces,
  getTemplateDefinitions,
  type TemplateEditorContext,
} from "@/lib/prompt-template";
import { cn } from "@/lib/utils";

interface TemplateEditorProps {
  id?: string;
  value?: string;
  onChange?: (value: string) => void;
  context?: TemplateEditorContext;
  placeholder?: string;
  minRows?: number;
  maxRows?: number;
  className?: string;
  ariaLabel?: string;
  readOnly?: boolean;
  fillHeight?: boolean;
  markdownToolbar?: boolean;
}

const templateExtension = new Compartment();
const templateTheme = new Compartment();
const editorAttributes = new Compartment();
const placeholderExtension = new Compartment();
const readOnlyExtension = new Compartment();

export function TemplateEditor({
  id,
  value = "",
  onChange,
  context = "generic",
  placeholder,
  minRows = 5,
  maxRows,
  className,
  ariaLabel = "ChatLuna 模板内容",
  readOnly = false,
  fillHeight = false,
  markdownToolbar = false,
}: TemplateEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<EditorView>(null);
  const valueRef = useRef(value);
  const onChangeRef = useRef(onChange);
  const readOnlyRef = useRef(readOnly);
  const theme = useTheme();

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!containerRef.current) return;

    const state = EditorState.create({
      doc: valueRef.current,
      extensions: [
        basicSetup,
        EditorView.lineWrapping,
        editorAttributes.of([]),
        placeholderExtension.of([]),
        templateExtension.of([]),
        templateTheme.of([]),
        readOnlyExtension.of([
          EditorState.readOnly.of(readOnlyRef.current),
          EditorView.editable.of(!readOnlyRef.current),
        ]),
        EditorView.updateListener.of((update) => {
          if (!update.docChanged) return;
          const nextValue = update.state.doc.toString();
          if (nextValue === valueRef.current) return;
          valueRef.current = nextValue;
          onChangeRef.current?.(nextValue);
        }),
      ],
    });

    const view = new EditorView({ state, parent: containerRef.current });
    editorRef.current = view;

    return () => {
      view.destroy();
      editorRef.current = null;
    };
  }, []);

  useEffect(() => {
    const view = editorRef.current;
    if (!view) return;
    view.dispatch({
      effects: editorAttributes.reconfigure(
        EditorView.contentAttributes.of({
          "aria-label": ariaLabel,
          ...(id ? { id } : {}),
        }),
      ),
    });
  }, [ariaLabel, id]);

  useEffect(() => {
    const view = editorRef.current;
    if (!view) return;
    view.dispatch({
      effects: placeholderExtension.reconfigure(
        placeholder ? codeMirrorPlaceholder(placeholder) : [],
      ),
    });
  }, [placeholder]);

  useEffect(() => {
    const view = editorRef.current;
    if (!view) return;
    readOnlyRef.current = readOnly;
    view.dispatch({
      effects: readOnlyExtension.reconfigure([
        EditorState.readOnly.of(readOnly),
        EditorView.editable.of(!readOnly),
      ]),
    });
  }, [readOnly]);

  useEffect(() => {
    const view = editorRef.current;
    if (!view) return;
    view.dispatch({
      effects: templateExtension.reconfigure(
        createTemplateExtensions(context, readOnly),
      ),
    });
  }, [context, readOnly]);

  useEffect(() => {
    const view = editorRef.current;
    if (!view) return;
    view.dispatch({
      effects: templateTheme.reconfigure(
        createEditorTheme(
          theme.resolvedTheme === "dark",
          minRows,
          maxRows,
          fillHeight,
          !readOnly && !markdownToolbar,
        ),
      ),
    });
  }, [fillHeight, markdownToolbar, maxRows, minRows, readOnly, theme.resolvedTheme]);

  useEffect(() => {
    const view = editorRef.current;
    if (!view || value === valueRef.current) return;

    const selection = view.state.selection.main;
    valueRef.current = value;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: value },
      selection: {
        anchor: Math.min(selection.anchor, value.length),
        head: Math.min(selection.head, value.length),
      },
    });
  }, [value]);

  const applyInline = (before: string, after: string, placeholderText: string) => {
    const view = editorRef.current;
    if (!view) return;

    const selection = view.state.selection.main;
    const selectedText = view.state.sliceDoc(selection.from, selection.to);
    const content = selectedText || placeholderText;
    const insert = `${before}${content}${after}`;
    const contentFrom = selection.from + before.length;
    view.dispatch({
      changes: { from: selection.from, to: selection.to, insert },
      selection: {
        anchor: contentFrom,
        head: contentFrom + content.length,
      },
    });
    view.focus();
  };

  const applyLinePrefix = (prefix: string, stripHeadings = false) => {
    const view = editorRef.current;
    if (!view) return;

    const selection = view.state.selection.main;
    const firstLine = view.state.doc.lineAt(selection.from);
    const lastPosition = selection.to > selection.from ? selection.to - 1 : selection.to;
    const lastLine = view.state.doc.lineAt(lastPosition);
    const block = view.state.sliceDoc(firstLine.from, lastLine.to);
    const insert = block
      .split("\n")
      .map((line) => `${prefix}${stripHeadings ? line.replace(/^#{1,6}\s+/, "") : line}`)
      .join("\n");
    view.dispatch({
      changes: { from: firstLine.from, to: lastLine.to, insert },
      selection: {
        anchor: firstLine.from,
        head: firstLine.from + insert.length,
      },
    });
    view.focus();
  };

  const escapeSelection = () => {
    const view = editorRef.current;
    if (!view) return;

    const selection = view.state.selection.main;
    if (selection.empty) {
      view.dispatch({
        changes: { from: selection.from, insert: "{{}}" },
        selection: { anchor: selection.from + 2 },
      });
    } else {
      const selectedText = view.state.sliceDoc(selection.from, selection.to);
      const escaped = escapeTemplateBraces(selectedText);
      view.dispatch({
        changes: { from: selection.from, to: selection.to, insert: escaped },
        selection: { anchor: selection.from + escaped.length },
      });
    }
    view.focus();
  };

  return (
    <div
      className={cn(
        "flex flex-col",
        fillHeight && "h-full min-h-0",
        className,
      )}
    >
      {markdownToolbar && !readOnly && (
        <MarkdownToolbar
          onInline={applyInline}
          onLinePrefix={applyLinePrefix}
          onEscape={escapeSelection}
        />
      )}
      <div className={cn("relative min-h-0", fillHeight && "flex-1")}>
        <div ref={containerRef} className={cn(fillHeight && "h-full min-h-0")} />
        {!readOnly && !markdownToolbar && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute right-2 top-2 z-10 size-7 bg-background/80 text-muted-foreground backdrop-blur hover:text-foreground"
            onClick={escapeSelection}
            title="转义选区中的花括号；未选择文本时插入普通花括号"
            aria-label="转义花括号"
          >
            <Braces className="size-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}

function MarkdownToolbar({
  onInline,
  onLinePrefix,
  onEscape,
}: {
  onInline: (before: string, after: string, placeholderText: string) => void;
  onLinePrefix: (prefix: string, stripHeadings?: boolean) => void;
  onEscape: () => void;
}) {
  const keepSelection = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
  };
  const toolClass = "size-7 rounded-sm text-muted-foreground hover:text-foreground";

  return (
    <div
      className="flex h-9 shrink-0 items-center gap-0.5 overflow-x-auto border-b px-1.5"
      role="toolbar"
      aria-label="Markdown 格式工具栏"
    >
      <ToolbarButton label="一级标题" onMouseDown={keepSelection} onClick={() => onLinePrefix("# ", true)}>
        <Heading1 />
      </ToolbarButton>
      <ToolbarButton label="二级标题" onMouseDown={keepSelection} onClick={() => onLinePrefix("## ", true)}>
        <Heading2 />
      </ToolbarButton>
      <ToolbarButton label="三级标题" onMouseDown={keepSelection} onClick={() => onLinePrefix("### ", true)}>
        <Heading3 />
      </ToolbarButton>
      <ToolbarDivider />
      <ToolbarButton label="加粗" onMouseDown={keepSelection} onClick={() => onInline("**", "**", "加粗文本")}>
        <Bold />
      </ToolbarButton>
      <ToolbarButton label="斜体" onMouseDown={keepSelection} onClick={() => onInline("*", "*", "斜体文本")}>
        <Italic />
      </ToolbarButton>
      <ToolbarButton label="删除线" onMouseDown={keepSelection} onClick={() => onInline("~~", "~~", "删除文本")}>
        <Strikethrough />
      </ToolbarButton>
      <ToolbarButton label="下划线" onMouseDown={keepSelection} onClick={() => onInline("<u>", "</u>", "下划线文本")}>
        <Underline />
      </ToolbarButton>
      <ToolbarDivider />
      <ToolbarButton label="链接" onMouseDown={keepSelection} onClick={() => onInline("[", "](https://)", "链接文字")}>
        <Link />
      </ToolbarButton>
      <ToolbarButton label="图片" onMouseDown={keepSelection} onClick={() => onInline("![", "](https://)", "图片描述")}>
        <Image />
      </ToolbarButton>
      <ToolbarButton label="行内代码" onMouseDown={keepSelection} onClick={() => onInline("`", "`", "代码")}>
        <Code2 />
      </ToolbarButton>
      <ToolbarButton label="引用" onMouseDown={keepSelection} onClick={() => onLinePrefix("> ")}>
        <Quote />
      </ToolbarButton>
      <ToolbarButton label="无序列表" onMouseDown={keepSelection} onClick={() => onLinePrefix("- ")}>
        <List />
      </ToolbarButton>
      <ToolbarDivider />
      <ToolbarButton label="转义花括号" onMouseDown={keepSelection} onClick={onEscape}>
        <Braces />
      </ToolbarButton>
    </div>
  );

  function ToolbarButton({
    label,
    children,
    ...props
  }: ComponentProps<typeof Button> & { label: string }) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className={toolClass}
        title={label}
        aria-label={label}
        {...props}
      >
        {children}
      </Button>
    );
  }
}

function ToolbarDivider() {
  return <span className="mx-1 h-4 w-px shrink-0 bg-border" aria-hidden="true" />;
}

function createTemplateExtensions(
  context: TemplateEditorContext,
  readOnly: boolean,
) {
  const decorations = createDecorationPlugin(context);
  if (readOnly) return [decorations];

  return [
    decorations,
    autocompletion({
      override: [(completionContext) => getCompletions(completionContext, context)],
      activateOnTyping: true,
    }),
    linter((view) => createDiagnostics(view.state.doc.toString(), context), {
      delay: 200,
    }),
  ];
}

function createDecorationPlugin(context: TemplateEditorContext) {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = buildDecorations(view.state.doc.toString(), context);
      }

      update(update: ViewUpdate) {
        if (update.docChanged) {
          this.decorations = buildDecorations(
            update.state.doc.toString(),
            context,
          );
        }
      }
    },
    { decorations: (plugin) => plugin.decorations },
  );
}

function buildDecorations(source: string, context: TemplateEditorContext) {
  const decorations = analyzeTemplate(source, context).map((range) =>
    Decoration.mark({ class: `cm-template-${range.kind}` }).range(
      range.from,
      range.to,
    ),
  );
  return Decoration.set(decorations, true);
}

function createDiagnostics(source: string, context: TemplateEditorContext) {
  return analyzeTemplate(source, context)
    .filter((range) => range.message)
    .map((range): Diagnostic => {
      const diagnostic: Diagnostic = {
        from: range.from,
        to: range.to,
        severity: range.kind === "error" ? "error" : "warning",
        message: range.message!,
      };

      if (range.kind === "unknown") {
        diagnostic.actions = [
          {
            name: "作为普通文本",
            apply(view, from, to) {
              const raw = view.state.sliceDoc(from, to);
              view.dispatch({
                changes: { from, to, insert: escapeTemplateBraces(raw) },
              });
            },
          },
        ];
      }

      return diagnostic;
    });
}

function getCompletions(
  context: CompletionContext,
  editorContext: TemplateEditorContext,
) {
  const match = context.matchBefore(/\{[A-Za-z_$]*$/);
  if (!match) return null;

  const from = match.from + 1;
  const options: Completion[] = getTemplateDefinitions(editorContext).map(
    (definition) => {
      const completion = {
        label: definition.label,
        detail: definition.detail,
        type: definition.type,
      };

      if (definition.snippet) {
        const snippet = snippetCompletion(definition.snippet, completion);
        const applySnippet = snippet.apply;
        return {
          ...snippet,
          apply(view, selectedCompletion, applyFrom, applyTo) {
            const replaceTo = consumeClosingBrace(view, applyTo);
            if (typeof applySnippet === "function") {
              applySnippet(
                view,
                selectedCompletion,
                applyFrom,
                replaceTo,
              );
            }
          },
        };
      }

      return {
        ...completion,
        apply(view, _completion, applyFrom, applyTo) {
          view.dispatch({
            changes: {
              from: applyFrom,
              to: consumeClosingBrace(view, applyTo),
              insert: `${definition.label}}`,
            },
          });
        },
      };
    },
  );

  options.unshift({
    label: "普通花括号",
    detail: "插入不会触发模板渲染的 {{ ... }}",
    type: "text",
    boost: 100,
    apply(view, _completion, applyFrom, applyTo) {
      view.dispatch({
        changes: {
          from: applyFrom - 1,
          to: consumeClosingBrace(view, applyTo),
          insert: "{{}}",
        },
        selection: { anchor: applyFrom + 1 },
      });
    },
  });

  return { from, options, validFor: /^[A-Za-z_$]*$/ };
}

function consumeClosingBrace(view: EditorView, position: number) {
  return view.state.sliceDoc(position, position + 1) === "}"
    ? position + 1
    : position;
}

function createEditorTheme(
  dark: boolean,
  minRows: number,
  maxRows?: number,
  fillHeight = false,
  overlayAction = false,
) {
  return EditorView.theme(
    {
      "&": {
        border: fillHeight ? "0" : "1px solid var(--input)",
        borderRadius: fillHeight ? "0" : "var(--radius)",
        backgroundColor: dark
          ? "color-mix(in oklch, var(--input) 30%, transparent)"
          : "transparent",
        fontSize: "0.875rem",
        overflow: "hidden",
        height: fillHeight ? "100%" : undefined,
      },
      "&.cm-focused": {
        outline: "none",
        borderColor: "var(--ring)",
      },
      ".cm-scroller": {
        minHeight: fillHeight
          ? "100%"
          : `${Math.max(minRows, 3) * 1.5}rem`,
        height: fillHeight ? "100%" : undefined,
        maxHeight: fillHeight
          ? "none"
          : maxRows
            ? `${Math.max(maxRows, minRows, 3) * 1.5}rem`
            : "32rem",
        fontFamily:
          "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
        lineHeight: "1.5rem",
      },
      ".cm-content": {
        padding: overlayAction
          ? "0.65rem 2.75rem 0.65rem 0.75rem"
          : "0.65rem 0.75rem",
        caretColor: "var(--foreground)",
      },
      ".cm-line": { padding: "0" },
      ".cm-gutters": { display: "none" },
      ".cm-cursor, .cm-dropCursor": {
        borderLeftColor: "var(--foreground)",
      },
      ".cm-selectionBackground, ::selection": {
        backgroundColor:
          "color-mix(in oklch, var(--primary) 16%, transparent) !important",
      },
      ".cm-placeholder": {
        color: "var(--muted-foreground)",
      },
      ".cm-tooltip": {
        border: "1px solid var(--border)",
        borderRadius: "0.5rem",
        backgroundColor: "var(--popover)",
        color: "var(--popover-foreground)",
        overflow: "hidden",
        boxShadow: "none",
      },
      ".cm-tooltip-autocomplete > ul > li[aria-selected]": {
        backgroundColor: "var(--accent)",
        color: "var(--accent-foreground)",
      },
      ".cm-tooltip.cm-tooltip-lint": {
        border: "none",
        borderRadius: "0",
        backgroundColor: "transparent",
        overflow: "visible",
      },
      ".cm-tooltip-lint .cm-diagnostic": {
        position: "relative",
        overflow: "hidden",
        border: "none",
        borderLeft: "none",
        borderRadius: "0.625rem",
        backgroundColor: dark
          ? "rgb(69 10 10 / 0.96)"
          : "rgb(254 242 242 / 0.98)",
        color: dark ? "#fecaca" : "#991b1b",
        padding: "0.625rem 0.875rem",
        boxShadow: "none",
      },
      ".cm-tooltip-lint .cm-diagnostic + .cm-diagnostic": {
        marginTop: "0.375rem",
      },
      ".cm-template-expression": {
        color: dark ? "#7dd3fc" : "#0369a1",
        backgroundColor: dark ? "rgb(14 116 144 / 0.2)" : "rgb(14 165 233 / 0.1)",
        borderRadius: "0.25rem",
      },
      ".cm-template-control": {
        color: dark ? "#c4b5fd" : "#6d28d9",
        backgroundColor: dark ? "rgb(109 40 217 / 0.2)" : "rgb(139 92 246 / 0.1)",
        borderRadius: "0.25rem",
      },
      ".cm-template-escaped": {
        color: dark ? "#86efac" : "#15803d",
        fontWeight: "600",
      },
      ".cm-template-unknown": {
        color: dark ? "#fcd34d" : "#a16207",
        textDecoration: "underline wavy",
        textDecorationColor: dark ? "#f59e0b" : "#ca8a04",
        textUnderlineOffset: "3px",
      },
      ".cm-template-error": {
        textDecoration: "underline dotted",
        textDecorationColor: "var(--muted-foreground)",
        textUnderlineOffset: "3px",
      },
      ".cm-diagnosticAction": {
        border: `1px solid ${dark ? "rgb(248 113 113 / 0.42)" : "rgb(220 38 38 / 0.25)"}`,
        borderRadius: "0.375rem",
        backgroundColor: dark
          ? "rgb(127 29 29 / 0.58)"
          : "rgb(255 255 255 / 0.72)",
        color: dark ? "#fee2e2" : "#991b1b",
        padding: "0.2rem 0.45rem",
        boxShadow: "none",
      },
    },
    { dark },
  );
}
