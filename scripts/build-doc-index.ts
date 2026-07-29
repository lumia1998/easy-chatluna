import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import { toString } from "mdast-util-to-string";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";
import {
  createChatLunaDocsSearchIndex,
  type ChatLunaDocChunk,
  type ChatLunaDocsIndexPayload,
} from "../src/lib/docs-search.ts";

const REPOSITORY = "ChatLunaLab/doc";
const SOURCE_REF = process.env.CHATLUNA_DOC_REF?.trim() || "main";
const OUTPUT_PATH = path.resolve("public/data/chatluna-doc-index.json");
const MIN_DOCUMENT_COUNT = 100;
const TARGET_CHUNK_SIZE = 1_300;
const MAX_CHUNK_SIZE = 1_800;
const MIN_CHUNK_SIZE = 420;

interface GitHubTreeEntry {
  path: string;
  type: "blob" | "tree";
}

interface MarkdownNode {
  type: string;
  depth?: number;
  lang?: string;
  value?: string;
  children?: MarkdownNode[];
}

interface Section {
  heading: string;
  units: Array<{ text: string; atomic: boolean }>;
}

async function main() {
  try {
    const sourceCommit = await resolveCommit();
    const files = await listMarkdownFiles(sourceCommit);
    if (files.length < MIN_DOCUMENT_COUNT) {
      throw new Error(`文档数量异常：仅发现 ${files.length} 篇 Markdown`);
    }
    const documents = await mapWithConcurrency(files, 10, async (sourcePath) => ({
      sourcePath,
      markdown: await fetchText(
        `https://raw.githubusercontent.com/${REPOSITORY}/${sourceCommit}/${sourcePath}`,
      ),
    }));
    const chunks = documents.flatMap(({ sourcePath, markdown }) =>
      chunkMarkdown(sourcePath, markdown, sourceCommit),
    );
    if (chunks.length < 200) {
      throw new Error(`文档切块数量异常：仅生成 ${chunks.length} 个 chunk`);
    }
    const ids = new Set(chunks.map((chunk) => chunk.id));
    if (ids.size !== chunks.length) throw new Error("文档 chunk ID 不唯一");

    const index = createChatLunaDocsSearchIndex(chunks);
    const payload: ChatLunaDocsIndexPayload = {
      schemaVersion: 1,
      sourceRepo: `https://github.com/${REPOSITORY}`,
      sourceCommit,
      license: "CC-BY-SA-4.0",
      documentCount: documents.length,
      chunkCount: chunks.length,
      index: index.toJSON(),
    };
    await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
    await writeFile(OUTPUT_PATH, JSON.stringify(payload), "utf8");
    console.log(
      `[docs:index] ${documents.length} documents -> ${chunks.length} chunks (${sourceCommit.slice(0, 8)})`,
    );
  } catch (error) {
    try {
      const existing = JSON.parse(
        await readFile(OUTPUT_PATH, "utf8"),
      ) as Partial<ChatLunaDocsIndexPayload>;
      if (existing.schemaVersion === 1 && existing.chunkCount && existing.chunkCount > 0) {
        console.warn(
          `[docs:index] update failed; using cached index: ${error instanceof Error ? error.message : error}`,
        );
        return;
      }
    } catch {
      // Without a valid cached index, the build must fail.
    }
    throw error;
  }
}

async function resolveCommit(): Promise<string> {
  const data = await fetchJson<{ sha: string }>(
    `https://api.github.com/repos/${REPOSITORY}/commits/${encodeURIComponent(SOURCE_REF)}`,
  );
  if (!/^[a-f0-9]{40}$/i.test(data.sha)) throw new Error("无法解析文档 commit");
  return data.sha;
}

async function listMarkdownFiles(commit: string): Promise<string[]> {
  const data = await fetchJson<{ tree: GitHubTreeEntry[]; truncated?: boolean }>(
    `https://api.github.com/repos/${REPOSITORY}/git/trees/${commit}?recursive=1`,
  );
  if (data.truncated) throw new Error("GitHub tree 响应被截断");
  return data.tree
    .filter(
      (entry) =>
        entry.type === "blob" &&
        entry.path.startsWith("docs/") &&
        entry.path.endsWith(".md") &&
        !entry.path.startsWith("docs/.vitepress/"),
    )
    .map((entry) => entry.path)
    .sort();
}

function chunkMarkdown(
  sourcePath: string,
  markdown: string,
  sourceCommit: string,
): ChatLunaDocChunk[] {
  const parsedMatter = matter(markdown);
  const content = parsedMatter.content.replace(
    /<script\s+setup[^>]*>[\s\S]*?<\/script>/gi,
    "",
  );
  const tree = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .parse(content) as MarkdownNode;
  const firstHeading = tree.children?.find(
    (node) => node.type === "heading" && node.depth === 1,
  );
  const frontmatterTitle =
    typeof parsedMatter.data.title === "string" && parsedMatter.data.title.trim()
      ? parsedMatter.data.title.trim()
      : null;
  const heroName =
    parsedMatter.data.hero && typeof parsedMatter.data.hero.name === "string"
      ? parsedMatter.data.hero.name.trim()
      : null;
  const title =
    frontmatterTitle ||
    (firstHeading
      ? cleanText(toString(firstHeading as Parameters<typeof toString>[0]))
      : "") ||
    heroName ||
    fileTitle(sourcePath);
  const sections = collectSections(tree, title);
  const pieces = mergeSections(sections);
  const relativePath = sourcePath.replace(/^docs\//, "");
  const pageUrl = canonicalDocsUrl(relativePath);
  const provenanceUrl = `https://github.com/${REPOSITORY}/blob/${sourceCommit}/${sourcePath}`;

  return pieces.map((piece, index) => ({
    id: `${relativePath}#${index + 1}`,
    sourcePath,
    sourceCommit,
    title,
    heading: piece.heading,
    url: pageUrl,
    provenanceUrl,
    text: piece.text,
  }));
}

function collectSections(tree: MarkdownNode, title: string): Section[] {
  const sections: Section[] = [{ heading: title, units: [] }];
  const headingStack: string[] = [];
  for (const node of tree.children ?? []) {
    if (node.type === "heading") {
      const heading = cleanText(toString(node as Parameters<typeof toString>[0]));
      if (!heading || node.depth === 1) continue;
      const depth = Math.max(2, Math.min(4, node.depth ?? 2));
      headingStack.splice(depth - 2);
      headingStack[depth - 2] = heading;
      sections.push({
        heading: headingStack.filter(Boolean).join(" > "),
        units: [],
      });
      continue;
    }
    const unit = nodeToUnit(node);
    if (unit.text) sections.at(-1)!.units.push(unit);
  }
  return sections.filter((section) => section.units.length > 0);
}

function nodeToUnit(node: MarkdownNode): { text: string; atomic: boolean } {
  if (node.type === "code") {
    const language = node.lang ? `代码 (${node.lang})\n` : "代码\n";
    return { text: `${language}${node.value ?? ""}`.trim(), atomic: true };
  }
  const text = cleanText(toString(node as Parameters<typeof toString>[0]));
  return { text, atomic: false };
}

function mergeSections(sections: Section[]): Array<{ heading: string; text: string }> {
  const pieces = sections.flatMap((section) => splitSection(section));
  const merged: Array<{ heading: string; text: string }> = [];
  for (const piece of pieces) {
    const previous = merged.at(-1);
    if (
      previous &&
      (previous.text.length < MIN_CHUNK_SIZE ||
        previous.text.length + piece.text.length <= TARGET_CHUNK_SIZE)
    ) {
      previous.heading =
        previous.heading === piece.heading
          ? previous.heading
          : `${previous.heading} · ${piece.heading}`;
      previous.text = `${previous.text}\n\n${piece.heading}\n${piece.text}`;
    } else {
      merged.push({ ...piece });
    }
  }
  return merged;
}

function splitSection(section: Section): Array<{ heading: string; text: string }> {
  const chunks: string[] = [];
  let current = "";
  const flush = () => {
    if (current.trim()) chunks.push(current.trim());
    current = "";
  };
  for (const unit of section.units) {
    if (!unit.atomic && unit.text.length > MAX_CHUNK_SIZE) {
      flush();
      for (let start = 0; start < unit.text.length; start += MAX_CHUNK_SIZE - 160) {
        chunks.push(unit.text.slice(start, start + MAX_CHUNK_SIZE).trim());
      }
      continue;
    }
    const candidate = current ? `${current}\n\n${unit.text}` : unit.text;
    if (current && candidate.length > MAX_CHUNK_SIZE) flush();
    current = current ? `${current}\n\n${unit.text}` : unit.text;
  }
  flush();
  return chunks.map((text) => ({ heading: section.heading, text }));
}

function cleanText(value: string): string {
  return value
    .replace(/^:::\s*\w+.*$/gm, "")
    .replace(/^:::\s*$/gm, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function canonicalDocsUrl(relativePath: string): string {
  if (relativePath === "index.md") return "https://chatluna.chat/";
  return `https://chatluna.chat/${relativePath.replace(/\.md$/, ".html")}`;
}

function fileTitle(sourcePath: string): string {
  return path.basename(sourcePath, ".md").replace(/[-_]+/g, " ");
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "easy-chatluna-doc-indexer",
    },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`${url} 返回 ${response.status}`);
  return (await response.json()) as T;
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`${url} 返回 ${response.status}`);
  return response.text();
}

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  mapper: (value: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let cursor = 0;
  async function worker() {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(values[index]);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, () => worker()),
  );
  return results;
}

await main();
