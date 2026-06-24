export interface RssSource {
  name: string;
  url: string;
  lang: "en" | "zh";
  category: "ai" | "news" | "research" | "deep" | "tech";
  weight: number;
}

export interface Article {
  title: string;
  url: string;
  sourceName: string;
  sourceLang: string;
  sourceCategory: string;
  sourceWeight: number;
  publishedAt: string;
  snippet?: string;
}

export interface CurationResult {
  date: string;
  editorNote: string;
  topPicks: CuratedArticle[];
  picks: CuratedArticle[];
}

export interface CuratedArticle {
  rank: number;
  title: string;
  source: string;
  url: string;
  summary: string;
  reason: string;
  scores?: CurationScores;
}

export interface CurationScores {
  topic: number;
  content: number;
  depth: number;
  practical: number;
  innovation: number;
  clarity: number;
}

export interface ScoredArticle extends Article {
  scores: CurationScores;
  totalScore: number;
}

export interface ReviewResult {
  pass: boolean;
  issues: string[];
  suggestions: string[];
}

export interface SourcesConfig {
  sources: RssSource[];
  settings: {
    maxArticlesPerSource: number;
    maxTotalArticles: number;
    lookbackHours: number;
    outputDir: string;
  };
}
