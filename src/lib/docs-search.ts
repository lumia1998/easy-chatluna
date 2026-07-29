import MiniSearch from "minisearch";

export interface ChatLunaDocChunk {
  id: string;
  sourcePath: string;
  sourceCommit: string;
  title: string;
  heading: string;
  url: string;
  provenanceUrl: string;
  text: string;
}

export interface ChatLunaDocsIndexPayload {
  schemaVersion: 1;
  sourceRepo: string;
  sourceCommit: string;
  license: "CC-BY-SA-4.0";
  documentCount: number;
  chunkCount: number;
  index: unknown;
}

function createSearchOptions() {
  return {
    fields: ["title", "heading", "text", "sourcePath"],
    storeFields: [
      "id",
      "sourcePath",
      "sourceCommit",
      "title",
      "heading",
      "url",
      "provenanceUrl",
      "text",
    ],
    tokenize: tokenizeChatLunaDocs,
    processTerm: (term: string) => term,
  };
}

export function createChatLunaDocsSearchIndex(
  chunks: ChatLunaDocChunk[],
): MiniSearch<ChatLunaDocChunk> {
  const index = new MiniSearch<ChatLunaDocChunk>(createSearchOptions());
  index.addAll(chunks);
  return index;
}

export function loadChatLunaDocsSearchIndex(
  serialized: unknown,
): MiniSearch<ChatLunaDocChunk> {
  return MiniSearch.loadJSON<ChatLunaDocChunk>(
    JSON.stringify(serialized),
    createSearchOptions(),
  );
}

export function searchChatLunaDocs(
  index: MiniSearch<ChatLunaDocChunk>,
  query: string,
  limit = 6,
): ChatLunaDocChunk[] {
  const results = index.search(query, {
    boost: { title: 5, heading: 3, sourcePath: 2, text: 1 },
    prefix: true,
    fuzzy: 0.12,
    combineWith: "OR",
  });
  const ranked = results
    .map((result) => ({
      chunk: result as unknown as ChatLunaDocChunk,
      score: rerankScore(result as unknown as ChatLunaDocChunk, result.score, query),
    }))
    .sort((left, right) => right.score - left.score);
  const minimumScore = (ranked[0]?.score ?? 0) * 0.35;
  const perPage = new Map<string, number>();
  const selected: ChatLunaDocChunk[] = [];

  for (const { chunk, score } of ranked) {
    if (score < minimumScore) break;
    const pageCount = perPage.get(chunk.sourcePath) ?? 0;
    if (pageCount >= 2) continue;
    perPage.set(chunk.sourcePath, pageCount + 1);
    selected.push(chunk);
    if (selected.length >= limit) break;
  }
  return selected;
}

function rerankScore(
  chunk: ChatLunaDocChunk,
  searchScore: number,
  query: string,
): number {
  const normalizedQuery = query.normalize("NFKC").toLowerCase();
  const normalizedTitle = chunk.title.normalize("NFKC").toLowerCase();
  const primaryFields = `${chunk.title}\n${chunk.heading}\n${chunk.sourcePath}`
    .normalize("NFKC")
    .toLowerCase();
  const allFields = `${primaryFields}\n${chunk.text.normalize("NFKC").toLowerCase()}`;
  const latinTerms: string[] =
    normalizedQuery.match(/[a-z0-9][a-z0-9_@./:{}+-]*/g) ?? [];
  let score = searchScore;

  for (const term of latinTerms.filter((value) => value.length >= 3)) {
    if (normalizedTitle === term) score *= 4;
    else if (primaryFields.includes(term)) score *= 2.5;
    else if (allFields.includes(term)) score *= 1.35;
    else score *= 0.35;
  }

  const asksForInstructions = /怎么|如何|配置|安装|使用|教程|设置/.test(
    normalizedQuery,
  );
  if (asksForInstructions) {
    if (chunk.sourcePath.startsWith("docs/guide/")) score *= 1.35;
    if (chunk.sourcePath.startsWith("docs/development/")) score *= 0.55;
  }
  if (/配置|设置/.test(normalizedQuery) && chunk.sourcePath.includes("/configure-")) {
    score *= 1.6;
  }
  if (
    normalizedQuery.includes("插件") &&
    chunk.sourcePath.startsWith("docs/ecosystem/plugin/")
  ) {
    score *= 2.4;
  }
  if (
    normalizedQuery.includes("预设") &&
    chunk.sourcePath.startsWith("docs/guide/preset-system/")
  ) {
    score *= 1.25;
  }
  return score;
}

export function tokenizeChatLunaDocs(value: string): string[] {
  const normalized = value.normalize("NFKC").toLowerCase();
  const groups = normalized.match(
    /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]+|[a-z0-9_@./:{}+-]+/gu,
  ) ?? [];
  const tokens = new Set<string>();

  for (const group of groups) {
    if (/^[a-z0-9]/.test(group)) {
      tokens.add(group);
      for (const part of group.split(/[./:{}+-]+/)) {
        if (part) tokens.add(part);
      }
      continue;
    }

    const characters = [...group];
    for (const character of characters) tokens.add(character);
    for (let index = 0; index < characters.length - 1; index += 1) {
      tokens.add(`${characters[index]}${characters[index + 1]}`);
    }
  }
  return [...tokens];
}
