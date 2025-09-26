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

// 本文HTMLから最初の画像URLを拾う（SEO強化用）
function pickFirstImage(html = "") {
  // <img src="..."> を探す（絶対 or 相対パス）
  const m = html.match(/<img\s+[^>]*src=["']([^"']+)["'][^>]*>/i);
  return m ? m[1] : null;
}

// 絶対URLを組み立てる（siteOrigin は getSiteOrigin() で取得済み）
function absUrlFor(path, siteOrigin) {
  // path は "/blog/2/" 形式
  return `${siteOrigin}${path}`;
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

// Markdown → HTML変換（GitHub API使用）
async function convertMarkdownToHtml(markdown, repo = REPO) {
  if (!markdown) return "";
  
  console.log(`[INFO] Markdown → HTML変換中...`);
  const res = await fetch(`${API_BASE}/markdown`, {
    method: "POST",
    headers: {
      "Accept": "application/vnd.github+json",
      "Content-Type": "application/json",
      ...(GH_TOKEN ? { "Authorization": `Bearer ${GH_TOKEN}` } : {})
    },
    body: JSON.stringify({
      text: markdown,
      mode: "gfm", // GitHub Flavored Markdown
      context: repo
    })
  });
  
  if (!res.ok) {
    console.warn(`[WARN] Markdown変換失敗、そのまま使用: ${res.status}`);
    return markdown; // 失敗したらそのまま返す
  }
  
  return await res.text();
}

// サイトの絶対オリジン + ベースパス（User/Org Pages と Project Pages の両対応）
function getSiteOrigin() {
  const owner = process.env.GITHUB_REPOSITORY_OWNER || "example";
  const base  = SITE_BASE === "/" ? "" : SITE_BASE.replace(/\/$/, "");
  return `https://${owner}.github.io${base}`;
}

// トップページ用ブログセクション生成
async function generateTopPageBlogSection(posts, siteOrigin) {
  console.log("[INFO] トップページ用ブログセクション生成開始");
  
  // 最新3記事を取得
  const recentPosts = posts.slice(0, 3);
  
  const blogItems = recentPosts.map(p => {
    const date = ymd(p.createdAt);
    const url = `${SITE_BASE.replace(/\/+$/, "")}${p.path}`;
    return `
    <div class="blog-card">
      <div class="blog-card-header">
        <span class="blog-date">${date}</span>
        <span class="blog-tag">Tech</span>
      </div>
      <h3 class="blog-title">
        <a href="${url}">${htmlEscape(p.title)}</a>
      </h3>
      <p class="blog-excerpt">
        くろメロンの技術ブログ - iOS開発やSwiftに関する最新情報をお届けします
      </p>
      <div class="blog-card-footer">
        <a href="${url}" class="blog-read-more">記事を読む <i class="fas fa-arrow-right"></i></a>
      </div>
    </div>`;
  }).join("\n");

  const blogSection = `
  <!-- Blog Section (Auto-generated by build-blog.mjs) -->
  <section id="blog" class="blog-section">
    <div class="container">
      <div class="section-header">
        <h2 class="section-title">Latest Blog Posts</h2>
        <p class="section-subtitle">技術ブログ - 最新記事</p>
      </div>
      <div class="blog-grid">
        ${blogItems || '<p class="no-posts">記事準備中です...</p>'}
      </div>
      <div class="blog-more">
        <a href="${SITE_BASE.replace(/\/+$/, "")}/blog/" class="btn-secondary">
          <i class="fas fa-rss"></i> ブログ一覧を見る
        </a>
      </div>
    </div>
  </section>
  <!-- /Blog Section -->`;

  // index.html を読み込み
  let indexHtml;
  try {
    indexHtml = await fs.readFile("index.html", "utf8");
  } catch (err) {
    console.warn("[WARN] index.html が見つかりません、スキップします");
    return;
  }

  // 既存のブログセクションを削除（重複防止）
  indexHtml = indexHtml.replace(/<!-- Blog Section.*?<!-- \/Blog Section -->/gs, "");

  // Works セクションの後に挿入
  const worksEndPattern = /<\/section>\s*(?=\s*<section id="contact")/;
  if (worksEndPattern.test(indexHtml)) {
    indexHtml = indexHtml.replace(worksEndPattern, `</section>\n${blogSection}\n`);
    await fs.writeFile("index.html", indexHtml, "utf8");
    console.log("[INFO] トップページにブログセクション追加完了");
  } else {
    console.warn("[WARN] Works セクション終了位置が見つかりません");
  }
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

    // ====== Markdown → HTML変換 ======
    const bodyMarkdown = it.body || ""; // Issue本文（Markdownテキスト）
    const bodyHtml = await convertMarkdownToHtml(bodyMarkdown); // HTMLに変換
    console.log(`[INFO] 記事 #${number}: Markdown変換完了 (${bodyMarkdown.length} chars → ${bodyHtml.length} chars)`);
    
    const absUrl   = `${siteOrigin}/${BLOG_DIR}/${dirName}/`; // 絶対URL（canonical/OGP用）
    const desc     = stripTags(bodyHtml).slice(0, 160);       // 簡易メタディスクリプション

    // ====== SEO強化：<head> に title/canonical/description/OGP/JSON-LD を挿入 ======
    // 既存テンプレの <title> を差し替え
    const headerWithTitle = header.replace(/<title>[\s\S]*?<\/title>/i, `<title>${titleEsc} | くろメロンのブログ</title>`);
    
    // 画像候補（本文の最初の画像、なければリポジトリ内の chackrun_thumb.jpg 等）
    const firstImg = pickFirstImage(bodyHtml) || "/assets/images/chackrun_thumb.jpg";
    const ogImage = firstImg.startsWith("http") ? firstImg : `${siteOrigin}${firstImg.replace(/^\//, "")}`;

    // publisher 情報（くろメロン用に設定）
    const publisher = {
      "@type": "Organization",
      "name": "くろメロンのブログ",
      "alternateName": "くろメロン技術ブログ",
      "logo": {
        "@type": "ImageObject",
        "url": `${siteOrigin}/assets/images/chackrun_thumb.jpg`
      },
      "sameAs": [
        `${siteOrigin}`,
        `${siteOrigin}/blog/`
      ]
    };

    const jsonLd = {
      "@context": "https://schema.org",
      "@type": "BlogPosting",
      "headline": title,
      "datePublished": new Date(createdAt).toISOString(),
      "mainEntityOfPage": absUrl,
      "url": absUrl,
      "author": {
        "@type": "Person",
        "name": "くろメロン"
      },
      "publisher": publisher,
      "image": ogImage,
      "description": desc
    };

    const seoHead = `
  <link rel="canonical" href="${absUrl}">
  <link rel="alternate" type="application/rss+xml" title="くろメロンのブログ" href="${siteOrigin}/rss.xml">
  <link rel="stylesheet" href="/blog/blog.css">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&family=Source+Code+Pro:wght@400;500;600&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
  
  <!-- シンタックスハイライト - highlight.js -->
  <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/languages/swift.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/languages/javascript.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/languages/typescript.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/languages/css.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/languages/json.min.js"></script>
  <script>
    document.addEventListener('DOMContentLoaded', function() {
      hljs.highlightAll();
      // コードブロックに言語ラベルを追加
      document.querySelectorAll('pre code').forEach(function(block) {
        const language = block.className.match(/language-(\w+)/);
        if (language) {
          const label = document.createElement('div');
          label.className = 'code-language-label';
          label.textContent = language[1].toUpperCase();
          block.parentNode.insertBefore(label, block);
        }
      });
    });
  </script>
  
  <meta name="description" content="${htmlEscape(desc)}">
  <meta property="og:type" content="article">
  <meta property="og:title" content="${titleEsc}">
  <meta property="og:description" content="${htmlEscape(desc)}">
  <meta property="og:url" content="${absUrl}">
  <meta property="og:image" content="${ogImage}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${titleEsc}">
  <meta name="twitter:description" content="${htmlEscape(desc)}">
  <meta name="twitter:image" content="${ogImage}">
  <script type="application/ld+json">
  ${JSON.stringify(jsonLd)}
  </script>`;
    const headerFinal = headerWithTitle.replace(/<\/head>/i, `${seoHead}\n</head>`);

    // X共有用のURL・テキスト生成
    const shareUrl = encodeURIComponent(absUrl);
    const shareText = encodeURIComponent(`${title} | くろメロンのブログ`);
    const twitterShareUrl = `https://twitter.com/intent/tweet?text=${shareText}&url=${shareUrl}`;

    const html = `
${headerFinal}
<main class="container">
  <article class="post">
    <h1>${titleEsc}</h1>
    <p class="meta">${ymd(createdAt)} · <a href="${it.html_url}" target="_blank" rel="noopener">Issue #${number}</a></p>
    
    <!-- 記事共有ボタン -->
    <div class="share-buttons">
      <span class="share-label">この記事をシェア:</span>
      <a href="${twitterShareUrl}" target="_blank" rel="noopener" class="share-btn twitter-share">
        <i class="fab fa-x-twitter"></i> Xでシェア
      </a>
      <button onclick="copyToClipboard('${absUrl}')" class="share-btn copy-link">
        <i class="fas fa-link"></i> リンクをコピー
      </button>
    </div>
    
    <div class="content">
      ${bodyHtml}
    </div>
    
    <!-- 記事下部の共有ボタン -->
    <div class="share-buttons bottom-share">
      <p class="share-cta">この記事が役に立ったら、ぜひシェアしてください！</p>
      <a href="${twitterShareUrl}" target="_blank" rel="noopener" class="share-btn twitter-share large">
        <i class="fab fa-x-twitter"></i> Xでシェア
      </a>
    </div>
  </article>
</main>

<script>
// リンクコピー機能
function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(function() {
    // コピー成功時の視覚的フィードバック
    const btn = event.target.closest('.copy-link');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-check"></i> コピー完了！';
    btn.style.background = 'var(--blog-success)';
    
    setTimeout(() => {
      btn.innerHTML = originalText;
      btn.style.background = '';
    }, 2000);
  }).catch(function(err) {
    console.error('コピーに失敗しました: ', err);
    alert('リンクのコピーに失敗しました');
  });
}
</script>

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

  // ブログ一覧ページにもダークテーマCSS + シンタックスハイライトを適用
  const headerWithBlogCSS = header.replace(/<\/head>/i, `
  <link rel="stylesheet" href="/blog/blog.css">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&family=Source+Code+Pro:wght@400;500;600&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
  
  <!-- シンタックスハイライト -->
  <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/languages/swift.min.js"></script>
  <script>
    document.addEventListener('DOMContentLoaded', function() {
      hljs.highlightAll();
    });
  </script>
</head>`);

  const indexHtml = `
${headerWithBlogCSS}
<main class="container">
  <h1>くろメロンのブログ</h1>
  <p class="blog-description">iOS開発、Swift、技術に関する記事を発信しています 🚀</p>
  <ul class="post-list">
    ${listItems || "<li>まだ記事がありません</li>"}
  </ul>
  <p class="rss-link"><a href="${SITE_BASE.replace(/\/+$/, "")}/rss.xml">📡 RSS購読</a></p>
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
  <title>くろメロンのブログ</title>
  <link>${siteOrigin}/blog/</link>
  <description>くろメロンの技術ブログ - iOS開発、Swift、プログラミングの情報を発信</description>
  ${rssItems}
</channel></rss>`;

  await fs.writeFile("rss.xml", rss, "utf8");
  console.log("[INFO] RSS生成: rss.xml");

  // 8) sitemap.xml 生成（SEO強化：優先度 / changefreq 付き）
  const sitemapItems = posts.map(p => {
    return `
  <url>
    <loc>${siteOrigin}${p.path}</loc>
    <lastmod>${new Date(p.createdAt).toISOString()}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>`;
  }).join("");

  // トップページとブログ一覧も追加
  const additionalPages = `
  <url>
    <loc>${siteOrigin}/</loc>
    <lastmod>${new Date().toISOString()}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>${siteOrigin}/blog/</loc>
    <lastmod>${new Date().toISOString()}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`;

  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${additionalPages}${sitemapItems}
</urlset>`;

  await fs.writeFile("sitemap.xml", sitemap, "utf8");
  console.log("[INFO] sitemap.xml 生成完了");

  // 9) トップページ用ブログ一覧セクション生成
  await generateTopPageBlogSection(posts, siteOrigin);

  // 完了
  console.log(`[INFO] 生成完了: 記事 ${posts.length} 件`);
}

// ==== 実行 ==== //
main().catch(err => {
  console.error(`[ERROR] ビルド失敗: ${err.message}`);
  process.exit(1);
});
