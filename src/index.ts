import * as dotenv from "dotenv";
import * as path from "path";
import * as fs from "fs";
import { collectArticles, saveArticles } from "./collector";
import { curateArticles } from "./curator";
import { renderHtml } from "./renderer";
import { sendEmail } from "./mailer";
import { SourcesConfig } from "./types";

dotenv.config();

async function main() {
  console.log("=".repeat(60));
  console.log("  AI Daily Brief — 每日 AI 早报生成系统");
  console.log("=".repeat(60));
  console.log(`  时间: ${new Date().toISOString()}`);
  console.log("=".repeat(60));

  // 1. Load config
  const configPath = path.resolve(__dirname, "..", "config", "sources.json");
  if (!fs.existsSync(configPath)) {
    console.error(`[ERROR] Config not found: ${configPath}`);
    process.exit(1);
  }
  const config: SourcesConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));
  const outputDir = path.resolve(__dirname, "..", config.settings.outputDir);

  console.log(`[config] Loaded ${config.sources.length} sources`);
  console.log(`[config] Output dir: ${outputDir}`);

  // 2. Collect articles from RSS
  console.log("\n--- Step 1: Collect Articles ---");
  const articles = await collectArticles(config);
  if (articles.length === 0) {
    console.error("[ERROR] No articles collected. Aborting.");
    process.exit(1);
  }
  const articlesFile = saveArticles(articles, outputDir);

  // 3. Curate via Claude CLI
  console.log("\n--- Step 2: Curate Articles ---");
  const curation = await curateArticles(articlesFile, outputDir);

  // 4. Render HTML email
  console.log("\n--- Step 3: Render HTML ---");
  const html = renderHtml(curation);
  const htmlFile = path.join(outputDir, "brief.html");
  fs.writeFileSync(htmlFile, html, "utf-8");
  console.log(`[renderer] Saved HTML to ${htmlFile}`);

  // 5. Send email
  console.log("\n--- Step 4: Send Email ---");
  const emailTo = process.env.EMAIL_TO;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;

  if (!smtpUser || !smtpPass) {
    console.warn("[mailer] No SMTP credentials set. Skipping email send.");
    console.warn("[mailer] HTML saved to output/brief.html — open it in browser to preview.");
  } else if (!emailTo) {
    console.warn("[mailer] No EMAIL_TO set. Skipping email send.");
  } else {
    try {
      await sendEmail(html, curation.date, emailTo);
      console.log("[mailer] Email sent successfully!");
    } catch (sendErr: any) {
      console.error(`[mailer] Email send failed: ${sendErr.message}`);
      console.log("[mailer] HTML is saved at output/brief.html — open it manually to preview.");
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log("  ✅ Done! AI Daily Brief generated successfully.");
  console.log("=".repeat(60));
}

main().catch((err) => {
  console.error("\n[FATAL]", err.message);
  process.exit(1);
});
