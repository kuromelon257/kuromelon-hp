// ============================================================
// GitHub Issues → 静的ブログ変換スクリプト
// ------------------------------------------------------------
// やること：
// 1. GitHub API から「LABEL=blog」の Issue を取得
// 2. Issue本文（HTMLとしてそのまま扱う）を記事にする
// 3. templates/header.html + 本文 + templates/footer.html を合体
// 4. /blog/以下に記事ページと一覧ページを出力
// 5. rss.xml を生成
//
// 日本語ログを多めに出力するので、Actionsのログで確認できます。
// ============================================================

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// __dirname 相当を作成（ESMでは直接__dirnameが使えない）
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ==== 環境変数（.yml 側から渡す） ==== //
const REPO      = process.env.REPO     || "";
const GH_TOKEN  = process.env.GH_TOKEN || "";
const LABEL     = process.env.LABEL    || "blog";
const BLOG_DIR  = process.env.BLOG_DIR || "blog";
const SITE_BASE = process.env.SITE_BASE|| "/";

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

// タイトルをURLスラッグに変換
function toSlug(title = "", fallback = "") {
  const base = title.trim().toLowerCase()
    .replace(/[\s　/\\]+/g, "-")     // スペース類をハイフンに
    .replace(/[^a-z0-9\-._~]/g, ""); // 不正文字除去
  return base || fallback;
}

// 日付フォーマット YYYY-MM-DD
function ymd(iso = "") {
  if (!iso) return "";
  return new Date(iso).toISOString().slice(0, 10);
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
  const issues = all.filter(it => !it.pull_request);
  console.log(`[INFO] 取得件数: ${all.length} / 公開対象: ${issues.length}`);

  const posts = [];

  // 4) 各記事ページを生成
  for (const it of issues) {
    const number = it.number;
    const title  = it.title || `(no title #${number})`;
    const titleEsc = htmlEscape(title);
    const createdAt = it.created_at || it.updated_at || new Date().toISOString();
    const slug = toSlug(title, `post-${number}`);
    const dirName = `${number}-${slug}`;
    const outDir = path.join(BLOG_DIR, dirName);

    await fs.mkdir(outDir, { recursive: true });

    const bodyHtml = it.body || ""; // Issue本文（そのままHTMLとして扱う）

    const html = `
${header}
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

  // 6) 一覧ページ生成
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

  // 7) RSS生成
  const siteOrigin = `https://${process.env.GITHUB_REPOSITORY_OWNER || "example"}.github.io${SITE_BASE === "/" ? "" : SITE_BASE.replace(/\/$/, "")}`;
  const rssItems = posts.slice(0, 50).map(p => `
    <item>
      <title>${htmlEscape(p.title)}</title>
      <link>${siteOrigin}${p.path}</link>
      <guid>${siteOrigin}${p.path}</guid>
      <pubDate>${new Date(p.createdAt).toUTCString()}</pubDate>
      <description>${htmlEscape(p.title)}（Issue #${p.number}）</description>
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
