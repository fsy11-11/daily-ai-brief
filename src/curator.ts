import { spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { CurationResult } from "./types";

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

const CURATION_SYSTEM_PROMPT = `You are an expert AI/tech editor curating a daily Chinese-language newsletter.

You will find a JSON file at the path given in the user message. Read it. Then:

1. Score each article on 6 dimensions (1-10):
   - topic (选题重要性): Is this a major AI industry direction?
   - content (内容质量): Information density, accuracy
   - depth (技术深度): Value for professionals
   - practical (实用价值): Can readers apply this?
   - innovation (创新程度): New perspective or breakthrough?
   - clarity (表达清晰): Is it well-written?

2. Selection rules:
   - Major vendor announcements (OpenAI, Anthropic, Google, Meta, Microsoft) get TOP priority
   - AI coding / agent content gets extra weight
   - Deduplicate: if multiple articles cover the same story, keep only the best one
   - Balance Chinese and English sources (aim for ~3-4 Chinese articles across all 10)
   - Favor high-weight sources (weight >= 8)

3. Output structure:
   - topPicks: exactly 3 articles — the MOST important AI news today, with deeper analysis
   - picks: exactly 7 articles — other high-quality content for broader coverage
   - editorNote: a 1-2 sentence overview of today's AI news in Chinese
   - Each article MUST have: title, source, url, summary (Chinese summary, 1-2 sentences), reason (入选理由, one Chinese sentence explaining why it was chosen)

4. Language rules:
   - All summaries and reasons in Chinese — this is a Chinese-language newsletter
   - Keep proper nouns in English: names (Karpathy, Altman), company names (OpenAI, Anthropic), product names (GPT-5, Claude, Gemini)
   - Keep technical terms in English: LLM, transformer, inference, fine-tuning, agent, RLHF, reasoning, scaling, etc.
   - Good example: "Karpathy 发文分析了 GPT-5 的 reasoning 能力，认为 RLHF 之后的 scaling 路线仍然是提升模型 performance 的关键"

IMPORTANT: Return valid JSON matching the schema exactly. Do NOT include any commentary outside the JSON.`;

export async function curateArticles(
  articlesFile: string,
  outputDir: string
): Promise<CurationResult> {
  console.log(`[curator] Curation starting with Claude CLI...`);

  // Write system prompt to a file for --system-prompt-file
  const systemPromptFile = path.join(outputDir, "system-prompt.txt");
  fs.writeFileSync(systemPromptFile, CURATION_SYSTEM_PROMPT, "utf-8");

  // Save schema for reference
  const schemaFile = path.join(outputDir, "curation-schema.json");
  const schemaObj = getCurationSchema();
  fs.writeFileSync(schemaFile, JSON.stringify(schemaObj, null, 2), "utf-8");

  // Pass schema inline (--json-schema expects JSON string, not file path)
  const schemaJson = JSON.stringify(schemaObj);

  const prompt = `Read the articles from ${articlesFile} and curate them. Return exactly the JSON specified in the schema.

Today's date: ${new Date().toISOString().slice(0, 10)}`;

  const args = [
    "-p",
    "--output-format", "json",
    "--json-schema", schemaJson,
    "--system-prompt-file", systemPromptFile,
    "--permission-mode", "bypassPermissions",
    "--no-session-persistence",
    prompt,
  ];

  console.log(`[curator] Calling claude CLI (timeout: 5 min)...`);

  try {
    const { stdout, stderr } = await spawnAsync("claude", args, {
      timeout: 600000,
      maxBuffer: 1024 * 1024 * 10,
      env: { ...process.env },
    });

    if (stderr && !stderr.includes("Warning:")) {
      console.warn(`[curator] stderr: ${stderr.slice(0, 500)}`);
    }

    // Claude CLI wraps output in {"result": "..."} when using --output-format json
    const trimmed = stdout.trim();
    const wrapper = JSON.parse(trimmed);

    // The actual curation result is in the "result" field (may be string or object)
    let result: CurationResult;
    if (typeof wrapper.result === "string") {
      result = JSON.parse(wrapper.result);
    } else if (wrapper.result && wrapper.result.topPicks) {
      result = wrapper.result;
    } else {
      throw new Error(`Unexpected output format: ${trimmed.slice(0, 200)}`);
    }

    console.log(
      `[curator] Curation complete: ${result.topPicks.length} top + ${result.picks.length} picks`
    );

    // Save curation result
    const resultFile = path.join(outputDir, "curation.json");
    fs.writeFileSync(resultFile, JSON.stringify(result, null, 2), "utf-8");
    console.log(`[curator] Saved to ${resultFile}`);

    return result;
  } catch (err: any) {
    console.error(`[curator] Claude CLI failed: ${err.message}`);
    if (err.stdout) console.error(`[curator] stdout: ${err.stdout.slice(0, 500)}`);
    if (err.stderr) console.error(`[curator] stderr: ${err.stderr.slice(0, 500)}`);
    throw new Error(`Curation failed: ${err.message}`);
  }
}

function getCurationSchema(): object {
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
        },
      },
    },
  };
}
