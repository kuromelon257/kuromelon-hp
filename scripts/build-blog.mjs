// 目的:
// - "blog" ラベル付きの Issue を GitHub API から取得
// - Issue本文（HTML）をヘッダー/フッターに挟んで各記事ページを生成
// - 記事一覧 (/blog/index.html) と RSS (rss.xml) も生成
//
// 前提:
// - templates/header.html と templates/footer.html を用意（共通レイアウト）
// - Issue本文は「そのままHTMLとして」埋め込む（Markdown変換はしない）
//
// 注意点:
// - Issue本文をそのままHTMLとして出すため、投稿者を信頼できる前提で運用してください（XSS等のリスク）
// - プロジェクトPages（/repo/パス配信）なら SITE_BASE を "/<repo>/" にする
//
// 実行環境:
// - Node.js v20（グローバル fetch 利用）
// - Actions からは GH_TOKEN, REPO, LABEL, BLOG_DIR, SITE_BASE を環境変数で受け取る

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// __dirname 相当（ESMでは直接使えないためお約束の書き方）
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// ==== 環境変数の読み込み（無ければデフォルト値） ==========================
const REPO     = process.env.REPO     || "";       // "owner/repo"
const GH_TOKEN = process.env.GH_TOKEN || "";       // GitHub API 認証用
const LABEL    = process.env.LABEL    || "blog";   // 公開対象ラベル
const BLOG_DIR = process.env.BLOG_DIR || "blog";   // 出力先ディレクトリ
const SITE_BASE= process.env.SITE_BASE|| "/";      // サイトのベースパス（末尾に "/" を推奨）

// ==== GitHub API エンドポイント ===========================================
const API_BASE = `https://api.github.com`;
const ISSUE_API = `${API_BASE}/repos/${REPO}/issues?state=open&labels=${encodeURIComponent(LABEL)}&per_page=100`;
// 備考: per_page=100 で最大100件。大量になる場合はページネーションを拡張してください（TODO）

// ==== 小物ユーティリティ ===================================================

// タイトルなど「タグに入れる部分」はエスケープして安全に
function htmlEscape(s = "") {
  return s.replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;" }[c]));
}

// タイトルからURL用のスラッグを作る（日本語・記号にもそこそこ耐性）
function toSlug(title = "", fallback = "") {
  const base = title
    .trim()
    .toLowerCase()
    // 全角・半角・スペース系をハイフンに寄せる（雑だが実用的）
    .replace(/[\s　/\\]+/g, "-")
    // URLに不向きな文字を除去
    .replace(/[^a-z0-9\-._~]/g, "");
  return base || fallback;
}

// 日付表示（YYYY-MM-DD）
function ymd(iso = "") {
  if (!iso) return "";
  return new Date(iso).toISOString().slice(0, 10);
}

// fetchの薄いラッパ（GitHub APIをトークン付きで叩く）
async function ghFetchJSON(url) {
  const res = await fetch(url, {
    headers: {
      "Accept": "application/vnd.github+json",
      ...(GH_TOKEN ? { "Authorization": `Bearer ${GH_TOKEN}` } : {})
    }
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`GitHub API error: ${res.status} ${text}`);
  }
  return res.json();
}

// ==== メイン処理 ===========================================================

async function main() {
  // 1) テンプレート読み込み（共通のヘッダー/フッター）
  const header = await fs.readFile(path.join("templates", "header.html"), "utf8");
  const footer = await fs.readFile(path.join("templates", "footer.html"), "utf8");

  // 2) 出力先ディレクトリを作成（存在しなければ作る）
  await fs.mkdir(BLOG_DIR, { recursive: true });

  // 3) Issue一覧を取得
  //    - /issues APIはPRも混じるので、"pull_request" フィールドの有無で除外
  const all = await ghFetchJSON(ISSUE_API);
  const issues = all.filter(it => !it.pull_request); // PRは除外

  // 4) 各記事ページを生成
  //    - URL: /blog/<number>-<slug>/index.html
  //    - タイトルはエスケープ、本文はそのまま（HTML）
  const posts = [];
  for (const it of issues) {
    const number    = it.number;
    const title     = it.title || `(no title #${number})`;
    const titleEsc  = htmlEscape(title);
    const createdAt = it.created_at || it.updated_at || new Date().toISOString();
    const slug      = toSlug(title, `post-${number}`);
    const dirName   = `${number}-${slug}`;                 // 例: "12-hello-world"
    const outDir    = path.join(BLOG_DIR, dirName);
    await fs.mkdir(outDir, { recursive: true });

    // 記事本文（Issue本文）はそのままHTMLとして埋め込む
    const bodyHtml  = it.body || ""; // 何も書かれてないときは空文字

    // 記事ページの中身（必要に応じて構造は調整してください）
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

    // 一覧/フィード用に記録
    posts.push({
      number,
      title,
      titleEsc,
      createdAt,
      path: `/${BLOG_DIR}/${dirName}/`, // 公開時パス（先頭スラッシュ始まり）
      issueUrl: it.html_url
    });
  }

  // 5) 新しい順に並べ替え（created_at 降順）
  posts.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  // 6) 一覧ページ (/blog/index.html) を生成
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

  // 7) RSS (rss.xml) を生成（最小実装）
  //    - User/Org Pages: SITE_BASE は "/" を想定
  //    - Project Pages: "https://<user>.github.io/<repo>" で公開されるため、後述の siteOrigin を調整
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

  console.log(`Generated ${posts.length} post(s).`);
}

// 例外はログって非0で終了（Actionsで失敗として検知できる）
main().catch(err => {
  console.error(err);
  process.exit(1);
});
