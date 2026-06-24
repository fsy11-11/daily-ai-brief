<p align="center">
  <img src="https://img.shields.io/badge/AI-Daily%20Brief-gold?style=for-the-badge" alt="AI Daily Brief">
</p>

<h1 align="center">📰 AI Daily Brief / AI 早报</h1>

<p align="center">
  <strong>自托管 AI 每日早报 · 聚合 17 个中英科技源 · AI 策展 · 杂志风邮件</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/runtime-Node.js%2022-brightgreen" alt="Node.js">
  <img src="https://img.shields.io/badge/AI-DeepSeek%20v4%20Pro-blue" alt="DeepSeek">
  <img src="https://img.shields.io/badge/deploy-GitHub%20Actions-2088FF?logo=githubactions" alt="GitHub Actions">
  <img src="https://img.shields.io/badge/license-MIT-green" alt="License">
</p>

---

## 🎯 这是什么？

BestBlogs.dev 的**自托管替代方案**。每天自动从 17 个优质中英文 AI/技术源抓取文章，通过 AI（Claude Code CLI + DeepSeek v4 Pro）多维度评分筛选，精选 10 篇最佳内容，生成杂志风格的 HTML 邮件发送到你的邮箱。

> 无需服务器、零 API 月费、完全开源。

## ✨ 核心特性

- **🤖 AI 策展** — 6 维度评分（选题、内容、深度、实用、创新、表达），而非简单关键词过滤
- **📊 分层推荐** — 🔥 3 篇重点推荐 + 📰 7 篇精选，仿 BestBlogs 的分层阅读体验
- **🎨 杂志风排版** — 深蓝+金色配色，卡片式布局，适配各类邮件客户端
- **🌍 中英双语源** — 14 个英文源（OpenAI、Google AI、arXiv 等）+ 4 个中文源（量子位、36氪等）
- **☁️ 云端运行** — GitHub Actions 定时触发，关机也不影响
- **💰 零成本** — DeepSeek API ~$0.10/次，GitHub Actions 免费额度完全够用
- **🔒 隐私优先** — 数据不过第三方服务，直接发到你的 QQ 邮箱

## 🏗 架构

```
┌──────────────────┐
│  17 个 RSS 源     │  OpenAI, Google AI, arXiv, 量子位, 36氪...
└────────┬─────────┘
         ▼
┌──────────────────┐
│  collector.ts    │  RSS 采集 · 去重 · 时间过滤
└────────┬─────────┘
         ▼
┌──────────────────┐
│  curator.ts      │  Claude Code CLI + DeepSeek
│  6维评分 + 精选   │  选题·内容·深度·实用·创新·表达
└────────┬─────────┘
         ▼
┌──────────────────┐
│  renderer.ts     │  杂志风格 HTML 邮件模板
└────────┬─────────┘
         ▼
┌──────────────────┐
│  mailer.ts       │  QQ SMTP 发送
└────────┬─────────┘
         ▼
    📬 你的邮箱
```

## 🚀 快速开始

### 前置条件

- Node.js ≥ 22
- QQ 邮箱（开启 SMTP 服务）
- DeepSeek API Key（[platform.deepseek.com](https://platform.deepseek.com)）
- Claude Code CLI

### 1. Clone 并安装

```bash
git clone https://github.com/fsy11-11/daily-ai-brief.git
cd daily-ai-brief
npm install
```

### 2. 配置环境变量

```bash
cp .env.example .env
```

编辑 `.env`：

```env
# QQ 邮箱 SMTP（mail.qq.com → 设置 → 账户 → 开启 SMTP 服务 → 获取授权码）
SMTP_USER=your-email@qq.com
SMTP_PASS=your-16-char-auth-code

# 接收早报的邮箱
EMAIL_TO=your-email@qq.com

# Claude Code CLI 配置（使用 DeepSeek 后端）
ANTHROPIC_API_KEY=your-deepseek-api-key
ANTHROPIC_AUTH_TOKEN=your-deepseek-api-key
ANTHROPIC_BASE_URL=https://api.deepseek.com/anthropic
ANTHROPIC_MODEL=deepseek-v4-pro
```

### 3. 本地运行

```bash
# 编译 TypeScript
npm run build

# 跑一次完整流程（采集 → 策展 → 发送）
npm start
```

### 4. 部署到 GitHub Actions（每日自动运行）

1. Fork 本仓库
2. 在 Settings → Secrets and variables → Actions 添加：
   - `SMTP_USER`
   - `SMTP_PASS`
   - `EMAIL_TO`
   - `DEEPSEEK_API_KEY`
3. Actions 已配置每天北京时间 7:00 AM 自动运行

也可随时手动触发：Actions → Daily AI Brief → Run workflow

## 📂 项目结构

```
daily-ai-brief/
├── src/
│   ├── index.ts          # 主流程编排
│   ├── collector.ts      # RSS 采集器
│   ├── curator.ts        # AI 策展（Claude Code CLI）
│   ├── renderer.ts       # HTML 邮件渲染
│   ├── mailer.ts         # QQ SMTP 发送
│   └── types.ts          # TypeScript 类型定义
├── config/
│   └── sources.json      # RSS 源配置（可自定义）
├── .github/workflows/
│   └── daily.yml         # GitHub Actions 定时任务
├── .env.example          # 环境变量模板
└── package.json
```

## 🔧 自定义

### 添加/移除 RSS 源

编辑 `config/sources.json`：

```json
{
  "name": "新源名称",
  "url": "https://example.com/rss.xml",
  "lang": "en",           // "en" 或 "zh"
  "category": "ai",       // "ai" | "news" | "research" | "deep" | "tech"
  "weight": 7             // 1-10，影响 AI 策展优先级
}
```

### 调整邮件风格

编辑 `src/renderer.ts` 中的 HTML 模板，支持任意 CSS 定制。

### 更换 AI 后端

修改 `ANTHROPIC_BASE_URL` 和 `ANTHROPIC_MODEL` 即可切换到任何 Anthropic 兼容 API（Claude API、DeepSeek、OpenRouter 等）。

## 📧 邮件效果预览

<div align="center">
  <img src="https://img.shields.io/badge/设计-深蓝%20%2B%20金色-1a1a2e?style=flat-square" alt="Color">
  <img src="https://img.shields.io/badge/重点推荐-3篇-e2c27d?style=flat-square" alt="Top">
  <img src="https://img.shields.io/badge/精选推荐-7篇-a8b2d1?style=flat-square" alt="Picks">
</div>

| 区域 | 样式 |
|------|------|
| Header | 深蓝渐变背景 (#0f0c29 → #16213e)，金色标题 |
| 编辑语 | 左侧金色边框引用，概述今日 AI 看点 |
| 🔥 重点推荐 | 金色边框卡片，编号圆形徽章，含入选理由 |
| 📰 精选推荐 | 灰色边框卡片，简洁排版 |
| Footer | 日期 + Powered by Claude Code |

## 📄 License

MIT © 2026

---

<p align="center">
  <sub>Built with ❤️ using <a href="https://claude.ai/code">Claude Code</a></sub>
</p>
