import { CurationResult, CuratedArticle, CurationScores } from "./types";

export function renderHtml(result: CurationResult): string {
  const dateStr = formatDate(result.date);
  const topPicksHtml = result.topPicks.map((a, i) => renderTopPick(a, i + 1)).join("\n");
  const picksHtml = result.picks.map((a, i) => renderPick(a, i + 4)).join("\n");

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="color-scheme" content="light">
<title>AI Daily Brief — ${dateStr}</title>
</head>
<body style="margin:0;padding:0;background-color:#f0f2f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0f2f5;padding:20px 0;">
<tr><td align="center">
<table width="640" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">

  <!-- Header -->
  <tr>
    <td style="background:linear-gradient(135deg,#0f0c29,#1a1a2e,#16213e);padding:40px 40px 36px;text-align:center;">
      <div style="font-family:Georgia,'Times New Roman',serif;font-size:28px;font-weight:700;color:#ffffff;letter-spacing:0.5px;margin-bottom:6px;">AI Daily Brief</div>
      <div style="font-size:16px;color:#a8b2d1;font-weight:400;">AI 早报 · ${dateStr}</div>
    </td>
  </tr>

  <!-- Editor Note -->
  <tr>
    <td style="padding:28px 40px 18px;">
      <div style="font-size:15px;color:#4a5568;line-height:1.7;font-style:italic;border-left:3px solid #e2c27d;padding-left:16px;">
        ${result.editorNote}
      </div>
    </td>
  </tr>

  <!-- Section: Top Picks -->
  <tr>
    <td style="padding:16px 40px 4px;">
      <div style="font-family:Georgia,'Times New Roman',serif;font-size:20px;font-weight:700;color:#1a1a2e;border-bottom:2px solid #e2c27d;padding-bottom:8px;display:inline-block;">
        🔥 重点推荐 · Top Picks
      </div>
    </td>
  </tr>
  <tr><td style="padding:12px 40px 8px;">${topPicksHtml}</td></tr>

  <!-- Section: More Picks -->
  <tr>
    <td style="padding:24px 40px 4px;">
      <div style="font-family:Georgia,'Times New Roman',serif;font-size:20px;font-weight:700;color:#1a1a2e;border-bottom:2px solid #a8b2d1;padding-bottom:8px;display:inline-block;">
        📰 精选推荐 · More Picks
      </div>
    </td>
  </tr>
  <tr><td style="padding:12px 40px 8px;">${picksHtml}</td></tr>

  <!-- Footer -->
  <tr>
    <td style="padding:32px 40px 40px;text-align:center;">
      <div style="border-top:1px solid #e2e8f0;padding-top:20px;">
        <div style="font-size:12px;color:#a0aec0;">
          AI Daily Brief · Powered by Claude Code · ${result.date}<br>
          每日自动生成 · 内容仅供参考
        </div>
        <div style="margin-top:8px;">
          <a href="#" style="font-size:11px;color:#718096;text-decoration:none;">Unsubscribe</a>
        </div>
      </div>
    </td>
  </tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

function renderTopPick(a: CuratedArticle, num: number): string {
  const scoreBar = a.scores ? renderScores(a.scores) : "";

  return `
<div style="background:#fffbeb;border:1px solid #e2c27d;border-radius:10px;padding:20px;margin-bottom:14px;">
  <div style="display:flex;align-items:flex-start;gap:12px;">
    <div style="background:#e2c27d;color:#1a1a2e;font-family:Georgia,serif;font-size:18px;font-weight:700;width:32px;height:32px;border-radius:50%;text-align:center;line-height:32px;flex-shrink:0;">${num}</div>
    <div style="flex:1;">
      <a href="${a.url}" style="font-size:17px;font-weight:700;color:#1a1a2e;text-decoration:none;line-height:1.4;display:block;">${a.title}</a>
      <div style="margin-top:4px;">
        <span style="font-size:12px;color:#718096;background:#edf2f7;padding:2px 8px;border-radius:4px;">${a.source}</span>
      </div>
      <div style="margin-top:8px;font-size:13px;color:#4a5568;line-height:1.6;">${a.summary}</div>
      <div style="margin-top:8px;font-size:12px;color:#e2c27d;font-weight:600;">
        ✦ ${a.reason}
      </div>
      ${scoreBar}
    </div>
  </div>
</div>`;
}

function renderPick(a: CuratedArticle, num: number): string {
  return `
<div style="border:1px solid #e2e8f0;border-radius:8px;padding:16px;margin-bottom:10px;">
  <div style="display:flex;align-items:flex-start;gap:10px;">
    <div style="color:#a0aec0;font-family:Georgia,serif;font-size:14px;font-weight:700;min-width:24px;text-align:center;line-height:1.5;">${num}</div>
    <div style="flex:1;">
      <a href="${a.url}" style="font-size:15px;font-weight:600;color:#1a1a2e;text-decoration:none;line-height:1.4;display:block;">${a.title}</a>
      <div style="margin-top:3px;">
        <span style="font-size:11px;color:#718096;background:#f7fafc;padding:1px 7px;border-radius:4px;">${a.source}</span>
      </div>
      <div style="margin-top:6px;font-size:12px;color:#4a5568;line-height:1.5;">${a.summary}</div>
    </div>
  </div>
</div>`;
}

function renderScores(scores: CurationScores): string {
  const items: [string, number][] = [
    ["选题", scores.topic],
    ["内容", scores.content],
    ["深度", scores.depth],
    ["实用", scores.practical],
    ["创新", scores.innovation],
    ["表达", scores.clarity],
  ];
  return `
<div style="margin-top:10px;display:flex;gap:10px;flex-wrap:wrap;">
  ${items
    .map(
      ([label, v]) =>
        `<span style="font-size:10px;color:#718096;">${label} <b style="color:#1a1a2e;">${v}</b></span>`
    )
    .join("")}
</div>`;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const weekdays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  const wd = weekdays[d.getDay()];
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${wd}`;
}
