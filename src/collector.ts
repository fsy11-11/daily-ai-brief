import Parser from "rss-parser";
import { Article, RssSource, SourcesConfig } from "./types";
import * as fs from "fs";
import * as path from "path";

const parser = new Parser({
  timeout: 15000,
  headers: { "User-Agent": "DailyAIBrief/1.0" },
});

export async function collectArticles(config: SourcesConfig): Promise<Article[]> {
  const { sources, settings } = config;
  const lookbackDate = new Date(Date.now() - settings.lookbackHours * 60 * 60 * 1000);

  console.log(`[collector] Fetching ${sources.length} RSS sources...`);

  const results = await Promise.allSettled(
    sources.map((source) => fetchSource(source, lookbackDate, settings.maxArticlesPerSource))
  );

  const allArticles: Article[] = [];
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result.status === "fulfilled") {
      allArticles.push(...result.value);
    } else {
      console.warn(`[collector] Failed: ${sources[i].name} — ${result.reason}`);
    }
  }

  // Deduplicate by URL
  const seen = new Set<string>();
  const deduped = allArticles.filter((a) => {
    const key = a.url;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const limited = deduped.slice(0, settings.maxTotalArticles);
  console.log(`[collector] Collected ${limited.length} articles (${deduped.length} before limit)`);

  return limited;
}

async function fetchSource(
  source: RssSource,
  lookbackDate: Date,
  maxPerSource: number
): Promise<Article[]> {
  try {
    const feed = await parser.parseURL(source.url);
    if (!feed.items || feed.items.length === 0) return [];

    const articles: Article[] = [];
    for (const item of feed.items) {
      if (articles.length >= maxPerSource) break;

      const pubDate = item.pubDate
        ? new Date(item.pubDate)
        : item.isoDate
        ? new Date(item.isoDate)
        : null;

      if (pubDate && pubDate < lookbackDate) continue;
      if (!pubDate && !item.link) continue;

      articles.push({
        title: item.title || "Untitled",
        url: item.link || "",
        sourceName: source.name,
        sourceLang: source.lang,
        sourceCategory: source.category,
        sourceWeight: source.weight,
        publishedAt: pubDate?.toISOString() || new Date().toISOString(),
        snippet: (item.contentSnippet || item.content || "").slice(0, 300),
      });
    }

    console.log(`  [${source.name}] ${articles.length} articles`);
    return articles;
  } catch (err: any) {
    console.warn(`  [${source.name}] Error: ${err.message}`);
    return [];
  }
}

export function saveArticles(articles: Article[], outputDir: string): string {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  const filepath = path.join(outputDir, "articles.json");
  fs.writeFileSync(filepath, JSON.stringify(articles, null, 2), "utf-8");
  console.log(`[collector] Saved ${articles.length} articles to ${filepath}`);
  return filepath;
}
