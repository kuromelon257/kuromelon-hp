// ============================================================
// GitHub Issues → 静的ブログ変換スクリプト（Issue番号で採番 / SEO対応）
// ------------------------------------------------------------
// やること：
// 1. GitHub API から「LABEL=blog」の Issue を取得
// 2. Issue本文（HTMLとしてそのまま扱う）を記事にする
// 3. templates/header.html + 本文 + templates/footer.html を合体
// 4. /blog/<Issue番号>/index.html と /blog/index.html を出力
// 5. rss.xml を生成（SITE_BASEに対応した絶対URL）
//
// ※ 日本語ログを多めに出力するので、Actionsのログで確認できます。
// ============================================================

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// __dirname 相当を作成（ESMでは直接__dirnameが使えない）
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// ==== 環境変数（.yml 側から渡す） ==== //
const REPO      = process.env.REPO      || "";
const GH_TOKEN  = process.env.GH_TOKEN  || "";
const LABEL     = process.env.LABEL     || "blog";
const BLOG_DIR  = process.env.BLOG_DIR  || "blog";
const SITE_BASE = process.env.SITE_BASE || "/"; // User/Org Pages は "/"、Project Pages は "/<repo>/"

// ==== GitHub API エンドポイント ==== //
const API_BASE  = `https://api.github.com`;
const ISSUE_API = `${API_BASE}/repos/${REPO}/issues?state=open&labels=${encodeURIComponent(LABEL)}&per_page=100`;

// ==== ユーティリティ ==== //

// HTMLタグに入れる部分はエスケープ
function htmlEscape(s = "") {
  return s.replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"
  }[c]));
}

// 日付フォーマット YYYY-MM-DD
function ymd(iso = "") {
  if (!iso) return "";
  return new Date(iso).toISOString().slice(0, 10);
}

// 本文からタグをざっくり除去して要約用テキストを作る（meta description用）
function stripTags(html = "") {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

// GitHub API を叩いて JSON 取得
async function ghFetchJSON(url) {
  console.log(`[INFO] APIリクエスト: ${url}`);
  const res = await fetch(url, {
    headers: {
      "Accept": "application/vnd.github+json",
      ...(GH_TOKEN ? { "Authorization": `Bearer ${GH_TOKEN}` } : {})
    }
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`GitHub API エラー: ${res.status} ${text}`);
  }
  return res.json();
}

// サイトの絶対オリジン + ベースパス（User/Org Pages と Project Pages の両対応）
function getSiteOrigin() {
  const owner = process.env.GITHUB_REPOSITORY_OWNER || "example";
  const base  = SITE_BASE === "/" ? "" : SITE_BASE.replace(/\/$/, "");
  return `https://${owner}.github.io${base}`;
}

// ==== メイン処理 ==== //
async function main() {
  console.log("[INFO] ブログ生成処理を開始します");

  // 1) テンプレート読み込み
  console.log("[INFO] テンプレート読込開始");
  const header = await fs.readFile(path.join("templates", "header.html"), "utf8");
  const footer = await fs.readFile(path.join("templates", "footer.html"), "utf8");
  console.log("[INFO] テンプレート読込完了");

  // 2) 出力ディレクトリ作成
  console.log(`[INFO] 出力ディレクトリを作成: ${BLOG_DIR}`);
  await fs.mkdir(BLOG_DIR, { recursive: true });

  // 3) Issue取得
  console.log(`[INFO] Issue取得開始: ラベル="${LABEL}"`);
  const all = await ghFetchJSON(ISSUE_API);
  const issues = all.filter(it => !it.pull_request); // PRは除外
  console.log(`[INFO] 取得件数: ${all.length} / 公開対象: ${issues.length}`);

  const posts = [];
  const siteOrigin = getSiteOrigin();

  // 4) 各記事ページを生成（採番は Issue番号をそのまま使用）
  for (const it of issues) {
    const number    = it.number;
    const title     = it.title || `(no title #${number})`;
    const titleEsc  = htmlEscape(title);
    const createdAt = it.created_at || it.updated_at || new Date().toISOString();

    // ====== 採番ルール：Issue番号をそのまま使う（/blog/<番号>/index.html） ======
    const dirName = String(number);
    const outDir  = path.join(BLOG_DIR, dirName);
    await fs.mkdir(outDir, { recursive: true });

    const bodyHtml = it.body || ""; // Issue本文（そのままHTMLとして扱う）
    const absUrl   = `${siteOrigin}/${BLOG_DIR}/${dirName}/`; // 絶対URL（canonical/OGP用）
    const desc     = stripTags(bodyHtml).slice(0, 160);       // 簡易メタディスクリプション

    // ====== SEO強化：<head> に title/canonical/description/OGP/JSON-LD を挿入 ======
    // 既存テンプレの <title> を差し替え
    const headerWithTitle = header.replace(/<title>[\s\S]*?<\/title>/i, `<title>${titleEsc} | Kuromelon Blog</title>`);
    // SEOタグを </head> の直前に挿入
    const seoHead = `
  <link rel="canonical" href="${absUrl}">
  <meta name="description" content="${htmlEscape(desc)}">
  <meta property="og:type" content="article">
  <meta property="og:title" content="${titleEsc}">
  <meta property="og:url" content="${absUrl}">
  <script type="application/ld+json">
  ${JSON.stringify({
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    "headline": title,
    "datePublished": new Date(createdAt).toISOString(),
    "mainEntityOfPage": absUrl,
    "url": absUrl
  })}
  </script>`;
    const headerFinal = headerWithTitle.replace(/<\/head>/i, `${seoHead}\n</head>`);

    const html = `
${headerFinal}
<main class="container">
  <article class="post">
    <h1>${titleEsc}</h1>
    <p class="meta">${ymd(createdAt)} · <a href="${it.html_url}" target="_blank" rel="noopener">Issue #${number}</a></p>
    <div class="content">
      ${bodyHtml}
    </div>
  </article>
</main>
${footer}
`.trim();

    await fs.writeFile(path.join(outDir, "index.html"), html, "utf8");
    console.log(`[INFO] 記事生成: ${outDir}/index.html`);

    posts.push({
      number,
      title,
      titleEsc,
      createdAt,
      path: `/${BLOG_DIR}/${dirName}/`,
      issueUrl: it.html_url
    });
  }

  // 5) 新しい順に並べ替え
  posts.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  // 6) 一覧ページ生成（/blog/index.html）
  const listItems = posts.map(p => {
    return `<li><a href="${SITE_BASE.replace(/\/+$/, "")}${p.path}">${htmlEscape(p.title)}</a> <span class="date">${ymd(p.createdAt)}</span></li>`;
  }).join("\n");

  const indexHtml = `
${header}
<main class="container">
  <h1>Blog</h1>
  <ul class="post-list">
    ${listItems || "<li>まだ記事がありません</li>"}
  </ul>
  <p><a href="${SITE_BASE.replace(/\/+$/, "")}/rss.xml">RSS</a></p>
</main>
${footer}
`.trim();

  await fs.writeFile(path.join(BLOG_DIR, "index.html"), indexHtml, "utf8");
  console.log(`[INFO] 一覧生成: ${BLOG_DIR}/index.html`);

  // 7) RSS生成（/rss.xml）
  const rssItems = posts.slice(0, 50).map(p => `
    <item>
      <title>${htmlEscape(p.title)}</title>
      <link>${siteOrigin}${p.path}</link>
      <guid>${siteOrigin}${p.path}</guid>
      <pubDate>${new Date(p.createdAt).toUTCString()}</pubDate>
      <description>${htmlEscape(stripTags(p.title))}（Issue #${p.number}）</description>
    </item>`).join("");

  const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
  <title>Kuromelon Blog</title>
  <link>${siteOrigin}/blog/</link>
  <description>Issues to static blog feed</description>
  ${rssItems}
</channel></rss>`;

  await fs.writeFile("rss.xml", rss, "utf8");
  console.log("[INFO] RSS生成: rss.xml");

  // 完了
  console.log(`[INFO] 生成完了: 記事 ${posts.length} 件`);
}

// ==== 実行 ==== //
main().catch(err => {
  console.error(`[ERROR] ビルド失敗: ${err.message}`);
  process.exit(1);
});
