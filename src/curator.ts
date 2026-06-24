import { spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { CurationResult, ScoredArticle, ReviewResult } from "./types";

// ─── spawnAsync helper (unchanged from original) ───────────────────

function spawnAsync(
  cmd: string,
  args: string[],
  opts: { timeout: number; maxBuffer: number; env: NodeJS.ProcessEnv }
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      env: opts.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data: Buffer) => {
      stdout += data.toString();
      if (opts.maxBuffer && stdout.length > opts.maxBuffer) {
        child.kill();
        reject(new Error("stdout maxBuffer exceeded"));
      }
    });

    child.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
      if (opts.maxBuffer && stderr.length > opts.maxBuffer) {
        child.kill();
        reject(new Error("stderr maxBuffer exceeded"));
      }
    });

    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`Command timed out after ${opts.timeout}ms`));
    }, opts.timeout);

    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        const err: any = new Error(`claude exited with code ${code}`);
        err.stdout = stdout;
        err.stderr = stderr;
        reject(err);
      }
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

// ─── claude CLI helper ─────────────────────────────────────────────

async function callClaudeForJson(
  prompt: string,
  schema: object,
  timeoutMs: number
): Promise<any> {
  const schemaJson = JSON.stringify(schema);

  const args = [
    "-p",
    "--output-format", "json",
    "--json-schema", schemaJson,
    "--permission-mode", "bypassPermissions",
    "--no-session-persistence",
    prompt,
  ];

  const { stdout, stderr } = await spawnAsync("claude", args, {
    timeout: timeoutMs,
    maxBuffer: 1024 * 1024 * 10,
    env: { ...process.env },
  });

  if (stderr && !stderr.includes("Warning:")) {
    console.warn(`[curator] stderr: ${stderr.slice(0, 500)}`);
  }

  const trimmed = stdout.trim();
  const wrapper = JSON.parse(trimmed);

  // Claude CLI wraps output in {"result": "..."} when using --output-format json
  let result: any;
  if (typeof wrapper.result === "string") {
    result = JSON.parse(wrapper.result);
  } else if (wrapper.result) {
    result = wrapper.result;
  } else {
    result = wrapper;
  }

  return result;
}

// ─── Stage 1: Score ────────────────────────────────────────────────

const SCORE_PROMPT = `You are an AI/tech editor scoring articles for a daily Chinese-language newsletter.

Read the articles from the file path provided below. Score EVERY article on these 6 dimensions (1-10 each):

1. topic (选题重要性): Is this a major AI industry direction or announcement?
   - Major vendor news (OpenAI, Anthropic, Google, Meta, Microsoft): 8-10
   - Niche or incremental updates: 3-5
2. content (内容质量): Information density, accuracy, and originality
   - Original reporting or deep analysis: 8-10
   - Shallow aggregation without insight: 2-4
3. depth (技术深度): Technical depth — valuable for AI professionals?
   - Contains architectural detail, code, or methodology: 8-10
   - Surface-level description: 2-4
4. practical (实用价值): Can readers apply this knowledge?
   - Actionable techniques, tools, or workflows: 8-10
   - Pure news or theory without practical takeaway: 2-4
5. innovation (创新程度): New perspective, breakthrough, or novel insight
   - Genuinely new idea or approach: 8-10
   - Well-covered existing topic: 2-4
6. clarity (表达清晰): Is it well-written and clear?
   - Well-structured, easy to follow: 8-10
   - Confusing or poorly organized: 2-4

Special rules:
- AI coding / agent / tooling content: bump practical by +1
- High-weight sources (weight >= 8): bump topic by +1
- Chinese sources (量子位, 36氪, 少数派, 虎嗅): score relative to Chinese tech media standards
- Research papers (arXiv): depth 7-9, practical 3-6

Return the scores in the specified JSON format. Score ALL articles — do not skip any.
Return ONLY the JSON, no other text.`;

function getScoreSchema(): object {
  return {
    type: "object",
    properties: {
      scoredArticles: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            url: { type: "string" },
            sourceName: { type: "string" },
            topic: { type: "integer" },
            content: { type: "integer" },
            depth: { type: "integer" },
            practical: { type: "integer" },
            innovation: { type: "integer" },
            clarity: { type: "integer" },
          },
          additionalProperties: true,
        },
      },
    },
    additionalProperties: true,
  };
}

async function scoreArticles(
  articlesFile: string,
  outputDir: string
): Promise<string> {
  console.log(`[curator:score] Scoring articles from ${articlesFile}...`);

  // Save prompt for debugging
  const promptFile = path.join(outputDir, "score-prompt.txt");
  const promptText = `${SCORE_PROMPT}\n\nArticles file: ${articlesFile}`;
  fs.writeFileSync(promptFile, promptText, "utf-8");

  const result = await callClaudeForJson(
    `Read the articles from: ${articlesFile}\n\n${SCORE_PROMPT}`,
    getScoreSchema(),
    600000
  );

  if (!result.scoredArticles || !Array.isArray(result.scoredArticles)) {
    throw new Error(
      `Unexpected score output: ${JSON.stringify(result).slice(0, 200)}`
    );
  }

  const scoreList = result.scoredArticles;
  console.log(`[curator:score] Received scores for ${scoreList.length} articles`);

  // Build score map by URL
  const scoreMap = new Map<string, any>();
  for (const s of scoreList) {
    if (s.url) {
      scoreMap.set(s.url, s);
    }
  }

  // Read original articles and merge with scores
  const articles = JSON.parse(fs.readFileSync(articlesFile, "utf-8"));
  const defaultScores = { topic: 5, content: 5, depth: 5, practical: 5, innovation: 5, clarity: 5 };

  const scored: ScoredArticle[] = articles.map((a: any) => {
    const s = scoreMap.get(a.url);
    const dims = s
      ? { topic: s.topic, content: s.content, depth: s.depth, practical: s.practical, innovation: s.innovation, clarity: s.clarity }
      : defaultScores;
    const totalScore = Math.round(
      ((dims.topic + dims.content + dims.depth + dims.practical + dims.innovation + dims.clarity) / 6) * 10
    ) / 10;

    return { ...a, scores: dims, totalScore };
  });

  // Log any articles that were in the score output but not in original
  for (const s of scoreList) {
    if (!articles.find((a: any) => a.url === s.url)) {
      console.warn(`[curator:score] Extra scored article not in source: ${s.title}`);
    }
  }

  // Sort by totalScore descending
  scored.sort((a, b) => b.totalScore - a.totalScore);

  // Save scored.json
  const scoredFile = path.join(outputDir, "scored.json");
  fs.writeFileSync(scoredFile, JSON.stringify(scored, null, 2), "utf-8");
  console.log(
    `[curator:score] Saved ${scored.length} scored articles to ${scoredFile} ` +
    `(range: ${scored[0]?.totalScore}-${scored[scored.length - 1]?.totalScore})`
  );

  return scoredFile;
}

// ─── Stage 2: Select & Summarize ───────────────────────────────────

const SELECT_PROMPT = `You are an expert AI/tech editor curating a daily Chinese-language newsletter.

You will read a JSON file containing pre-scored articles (sorted by totalScore descending). Each article has:
- title, url, sourceName, sourceLang, sourceCategory, sourceWeight, publishedAt, snippet
- scores: {topic, content, depth, practical, innovation, clarity}
- totalScore: weighted average of the 6 dimensions

Your job: select exactly 3 topPicks (🔥 重点推荐) and 7 picks (📰 精选推荐).

SELECTION RULES:
1. Use the provided scores as your primary guide, but apply editorial judgment
2. Major vendor announcements (OpenAI, Anthropic, Google, Meta, Microsoft) get TOP priority — elevate them even if their totalScore is slightly lower
3. AI coding / agent / tooling content gets extra weight
4. DEDUPLICATE: if multiple articles cover the same story/announcement, keep ONLY the best one
5. Balance Chinese and English sources: aim for 3-4 Chinese articles across all 10 picks
6. Favor high-weight sources (weight >= 8)
7. Ensure category diversity — don't pick all from one category (ai/news/research/deep/tech)

OUTPUT FORMAT:
- topPicks: exactly 3 articles — the MOST important AI news today, with deeper Chinese summaries (2-3 sentences each)
- picks: exactly 7 articles — other high-quality content for broader coverage, with concise Chinese summaries (1-2 sentences each)
- editorNote: 1-2 Chinese sentences giving an overview of today's AI news landscape

For EACH article, provide:
- rank: integer position
- title: original article title (keep in original language)
- source: source name
- url: article URL
- summary: Chinese summary (NOT a translation — a curated summary highlighting why it matters)
- reason: 入选理由 — one Chinese sentence explaining why this article was chosen (be specific, not generic)

LANGUAGE RULES:
- All summaries and reasons in Chinese — this is a Chinese-language newsletter
- Keep proper nouns in English: names (Karpathy, Altman), company names (OpenAI, Anthropic), product names (GPT-5, Claude, Gemini)
- Keep technical terms in English: LLM, transformer, inference, fine-tuning, agent, RLHF, reasoning, scaling
- Example summary: "Karpathy 发文分析了 GPT-5 的 reasoning 能力，认为 RLHF 之后的 scaling 路线仍然是提升模型 performance 的关键"

Return ONLY the JSON, no other text.`;

function getSelectSchema(): object {
  return {
    type: "object",
    properties: {
      date: { type: "string" },
      editorNote: { type: "string" },
      topPicks: {
        type: "array",
        items: {
          type: "object",
          properties: {
            rank: { type: "integer" },
            title: { type: "string" },
            source: { type: "string" },
            url: { type: "string" },
            summary: { type: "string" },
            reason: { type: "string" },
          },
          additionalProperties: true,
        },
      },
      picks: {
        type: "array",
        items: {
          type: "object",
          properties: {
            rank: { type: "integer" },
            title: { type: "string" },
            source: { type: "string" },
            url: { type: "string" },
            summary: { type: "string" },
            reason: { type: "string" },
          },
          additionalProperties: true,
        },
      },
    },
    additionalProperties: true,
  };
}

function buildSelectPrompt(
  scoredFile: string,
  feedback?: ReviewResult
): string {
  let prompt = `Read the scored articles from: ${scoredFile}\n\n${SELECT_PROMPT}`;

  if (feedback && feedback.issues.length > 0) {
    prompt += `\n\n⚠️ REVISION INSTRUCTIONS — Your previous curation had these issues:\n`;
    for (const issue of feedback.issues) {
      prompt += `  - ISSUE: ${issue}\n`;
    }
    if (feedback.suggestions.length > 0) {
      prompt += `\nSuggestions for fixing:\n`;
      for (const sug of feedback.suggestions) {
        prompt += `  - ${sug}\n`;
      }
    }
    prompt += `\nPlease fix ALL issues listed above and regenerate the curation.`;
  }

  return prompt;
}

async function selectAndSummarize(
  scoredFile: string,
  outputDir: string,
  feedback?: ReviewResult
): Promise<CurationResult> {
  const label = feedback ? "select:retry" : "select";
  console.log(
    `[curator:${label}] Selecting articles from ${scoredFile}...` +
    (feedback ? ` (with review feedback — ${feedback.issues.length} issues)` : "")
  );

  const prompt = buildSelectPrompt(scoredFile, feedback);

  // Save prompt for debugging
  const promptFile = path.join(outputDir, "select-prompt.txt");
  fs.writeFileSync(promptFile, prompt, "utf-8");

  // Save schema for reference
  const schemaFile = path.join(outputDir, "select-schema.json");
  fs.writeFileSync(schemaFile, JSON.stringify(getSelectSchema(), null, 2), "utf-8");

  const result = await callClaudeForJson(prompt, getSelectSchema(), 600000);

  // Validate result structure
  if (!result.topPicks || !Array.isArray(result.topPicks)) {
    throw new Error(
      `Unexpected select output: ${JSON.stringify(result).slice(0, 200)}`
    );
  }

  const curation: CurationResult = {
    date: result.date || new Date().toISOString().slice(0, 10),
    editorNote: result.editorNote || "今日 AI 要闻精选",
    topPicks: result.topPicks,
    picks: result.picks || [],
  };

  console.log(
    `[curator:${label}] Selected ${curation.topPicks.length} top + ${curation.picks.length} picks`
  );

  // Save curation result
  const curationFile = path.join(outputDir, "curation.json");
  fs.writeFileSync(curationFile, JSON.stringify(curation, null, 2), "utf-8");
  console.log(`[curator:${label}] Saved curation to ${curationFile}`);

  return curation;
}

// ─── Stage 3: Review ───────────────────────────────────────────────

const REVIEW_PROMPT = `You are a quality editor reviewing an AI newsletter curation before publication.

You will review TWO files:
1. The curation result (topPicks + picks + editorNote) — curated selections with Chinese summaries
2. The original scored articles — for accuracy checking

Check these 5 dimensions:

1. TOPIC DEDUP: Are any 2+ articles covering the exact same story/announcement?
   - Same product launch, same paper, same company announcement = DUPLICATE
   - Different angles on the same broad topic (e.g., "AI regulation") are OK
   - Flag duplicates with specific article titles

2. LANGUAGE BALANCE: Count Chinese-language sources (量子位, 36氪, 少数派, 虎嗅, or sourceLang="zh")
   - Acceptable range: 2-4 Chinese articles among the 10 total
   - Flag if outside this range

3. SUMMARY ACCURACY: Spot-check 2-3 summaries against the original article title+category+source
   - The summary should reflect what the article is actually about (based on title, source, and category)
   - Flag if a summary seems to describe a different topic than the title suggests
   - Note: you're checking for obvious mismatches, not verifying every factual claim

4. REASON QUALITY: Review the 入选理由 (reason field) for each article
   - Each reason should be specific to that article — not a generic phrase
   - Flag vague reasons like "值得一读", "内容不错", "最新研究", "技术前沿"
   - Good reasons mention specific content: "OpenAI 发布 GPT-5，在 reasoning 基准上超越人类专家"
   - Bad reasons are interchangeable between articles

5. EDITOR NOTE: Does the editorNote provide a meaningful overview?
   - Should mention 1-2 specific key stories from today's picks
   - Flag if too generic (e.g., just "今日 AI 新闻精选" with no specifics)

SCORING:
- pass: true — ALL 5 dimensions are satisfactory (minor nitpicks OK)
- pass: false — at least one dimension has a real problem that needs fixing
- issues: list specific problems (mention article titles/numbers so the editor knows exactly what to fix)
- suggestions: list concrete fix actions per issue

Be strict but fair. If the curation is good, pass it. Do not flag trivial wording preferences.
Return ONLY the JSON, no other text.`;

function getReviewSchema(): object {
  return {
    type: "object",
    properties: {
      pass: { type: "boolean" },
      issues: {
        type: "array",
        items: { type: "string" },
      },
      suggestions: {
        type: "array",
        items: { type: "string" },
      },
    },
    additionalProperties: true,
  };
}

async function reviewCuration(
  curationFile: string,
  articlesFile: string,
  outputDir: string,
  attempt: number
): Promise<ReviewResult> {
  console.log(`[curator:review] Reviewing curation quality...`);

  const prompt =
    `Review the curation for quality issues.\n\n` +
    `Curation file: ${curationFile}\n` +
    `Original articles (for accuracy checking): ${articlesFile}\n\n` +
    REVIEW_PROMPT;

  // Save prompt for debugging
  const promptFile = path.join(outputDir, "review-prompt.txt");
  fs.writeFileSync(promptFile, prompt, "utf-8");

  const result = await callClaudeForJson(prompt, getReviewSchema(), 300000);

  // Validate result structure
  const reviewResult: ReviewResult = {
    pass: result.pass === true,
    issues: Array.isArray(result.issues) ? result.issues : [],
    suggestions: Array.isArray(result.suggestions) ? result.suggestions : [],
  };

  console.log(
    `[curator:review] Review ${reviewResult.pass ? "PASSED" : "FAILED"} ` +
    `(${reviewResult.issues.length} issues)`
  );

  return reviewResult;
}

// ─── Orchestrator ──────────────────────────────────────────────────

export async function curateArticles(
  articlesFile: string,
  outputDir: string
): Promise<CurationResult> {
  console.log(`[curator] === 3-Stage Curation Pipeline ===`);
  console.log(`[curator] Articles: ${articlesFile}`);
  console.log(`[curator] Output: ${outputDir}`);

  // Stage 1: Score all articles
  console.log(`\n${"-".repeat(40)}`);
  console.log(`  Stage 1/3: Score Articles`);
  console.log(`${"-".repeat(40)}`);

  let scoredFile: string;
  try {
    scoredFile = await scoreArticles(articlesFile, outputDir);
  } catch (err: any) {
    console.error(
      `[curator] Stage 1 (score) FAILED: ${err.message}\n` +
      (err.stdout ? `  stdout: ${err.stdout.slice(0, 500)}\n` : "") +
      (err.stderr ? `  stderr: ${err.stderr.slice(0, 500)}` : "")
    );
    throw new Error(`Scoring failed — cannot proceed without scores: ${err.message}`);
  }

  // Stage 2 + Stage 3 loop with review gate
  const MAX_RETRIES = 3;
  let feedback: ReviewResult | undefined;
  let lastCuration: CurationResult | undefined;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    // Stage 2: Select & Summarize
    console.log(`\n${"-".repeat(40)}`);
    console.log(`  Stage 2/3: Select & Summarize (attempt ${attempt}/${MAX_RETRIES})`);
    console.log(`${"-".repeat(40)}`);

    try {
      lastCuration = await selectAndSummarize(scoredFile, outputDir, feedback);
    } catch (err: any) {
      console.error(
        `[curator] Stage 2 (select) FAILED (attempt ${attempt}): ${err.message}\n` +
        (err.stdout ? `  stdout: ${err.stdout.slice(0, 500)}\n` : "") +
        (err.stderr ? `  stderr: ${err.stderr.slice(0, 500)}` : "")
      );
      if (attempt < MAX_RETRIES) {
        console.warn(`[curator] Retrying Stage 2 in next attempt...`);
        continue;
      }
      throw new Error(
        `Selection failed after ${MAX_RETRIES} attempts: ${err.message}`
      );
    }

    // Stage 3: Review
    console.log(`\n${"-".repeat(40)}`);
    console.log(`  Stage 3/3: Review (attempt ${attempt}/${MAX_RETRIES})`);
    console.log(`${"-".repeat(40)}`);

    let review: ReviewResult;
    try {
      const curationFile = path.join(outputDir, "curation.json");
      review = await reviewCuration(curationFile, articlesFile, outputDir, attempt);
    } catch (err: any) {
      console.warn(
        `[curator] Stage 3 (review) crashed: ${err.message}. ` +
        `Treating as PASS — review tool failure should not block publication.`
      );
      // Save error for debugging
      const errFile = path.join(outputDir, `review-error-${attempt}.txt`);
      fs.writeFileSync(
        errFile,
        `Error: ${err.message}\n\nStdout: ${err.stdout || "n/a"}\n\nStderr: ${err.stderr || "n/a"}`,
        "utf-8"
      );
      return lastCuration!;
    }

    // Save review result for observability
    const reviewFile = path.join(outputDir, `review-${attempt}.json`);
    fs.writeFileSync(reviewFile, JSON.stringify(review, null, 2), "utf-8");
    console.log(`[curator] Review saved to ${reviewFile}`);

    if (review.pass) {
      console.log(`\n[curator] ✅ Review PASSED on attempt ${attempt}`);
      return lastCuration!;
    }

    console.warn(`\n[curator] ❌ Review FAILED — ${review.issues.length} issues to fix:`);
    for (const issue of review.issues) {
      console.warn(`   • ${issue}`);
    }
    if (review.suggestions.length > 0) {
      console.warn(`  Suggestions:`);
      for (const sug of review.suggestions) {
        console.warn(`   ↳ ${sug}`);
      }
    }

    feedback = review;
  }

  // Max retries exhausted — ship what we have
  console.warn(
    `\n[curator] ⚠️  Max retries (${MAX_RETRIES}) exhausted. ` +
    `Using last curation result (may have quality issues).`
  );
  return lastCuration!;
}
