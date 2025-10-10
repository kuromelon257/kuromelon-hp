# 指示
- あなたにはこれから技術ブログを、markdownで書いてもらいます。
- 読む対象は「githubは使用したことあるけど、commit, pushくらいしか使ったことない」くらいの人です。
- 私の作った「GithubのIssueをブログにする仕組み」について解説してください。
- 以下のファイルがその実装部分になります。
   - build-blog.yml
   - build-blog.mjs
- 読者が知らない概念は以下です。ブログで使用する場合は、先に用語の解説を入れてください。
   - github actions
   - github pages
   - .mjsファイル
- 以下ブログ本文を記載してください。

# GithubのIssueをブログにする仕組み

## はじめに
「QiitaやZennってハイレベルじゃないと浮く？」「既に同じテーマ山ほどあるのに書いていいの？」「カンファレンス参加ブログってレギュレーション違反？」──そんな不安が積み重なって、一回も投稿したことない私。

noteよりはもっとカスタマイズしたいけど、レンタルブログサービスを今さら選定する気力も湧かない。（FC2しか知らない）

息をするみたいにラフに投稿したい...

じゃあ“今もう慣れてる入力UI”＝GitHubのIssueをそのまま投稿画面にして、ブログ化される仕組み作っちゃえば良くない？
という思考から生まれたのがこの記事で紹介するワークフローになります。

# GitHubのIssueを“そのまま”ブログ化する仕組み（Actions×Pagesで自動公開）

先に結論：**GitHubのIssueに「blog」ラベルを付けて書くだけで、/blog/以下に記事ページ・一覧・RSS・サイトマップを自動生成してGitHub Pagesへ公開**できます。仕組みは次の2ファイルで動きます。

* `build-blog.yml`（GitHub Actions のワークフロー定義）
* `build-blog.mjs`（Issue → 静的HTMLのビルドスクリプト） 

---

## この記事で先に用語をサクッと整理

* **GitHub Actions**
  リポジトリのイベント（Issue作成・pushなど）を“合図”に自動でスクリプトを実行できる仕組み。無料枠内で十分使えます（公開リポジトリなら基本無料）。

* **GitHub Pages**
  リポジトリ内の静的ファイル（HTML/CSS/JS）を、GitHubがそのままホスティングしてくれる機能。`https://<ユーザー名>.github.io/<リポジトリ名>/` で公開されます。
  私はドメイン契約しているので、kuromelon.comで公開してます。

* **.mjs ファイル**
  Node.js の **ES Modules** 形式のJavaScriptファイル。`import ... from` 構文を使うため、拡張子を `.mjs` にしています（CommonJSの `.cjs` / `.js` と対になるモダンな書き方）。

---

## 全体像（どう動く？）

1. あなたは **Issue を新規作成**し、**「blog」ラベル**を付けて本文（Markdown）を書く
2. GitHub Actions（`build-blog.yml`）が起動し、`build-blog.mjs` を実行
3. スクリプトが Issue 一覧を取得 → Markdown をHTML化 → **`/blog/<Issue番号>/index.html`** に出力
4. 併せて **ブログ一覧 `/blog/index.html`、`rss.xml`、`sitemap.xml`** も作成
  - `/blog/index.html`: 全記事の入り口（人が回遊しやすい一覧ページ）
  - `rss.xml`: 更新通知用フィード（RSSリーダー / 外部連携向け）
  - `sitemap.xml`: 検索エンジン向けURLリスト（インデックス促進）
5. 生成物が GitHub Pages で配信され、**Issue＝ブログ記事**として公開完了！ 

---

## 最小構成（まずはこれだけあれば動く）

```
your-repo/
├─ .github/
│  └─ workflows/
│     └─ build-blog.yml      # Actions定義
├─ templates/
│  ├─ header.html            # <head>やヘッダー（必須）
│  └─ footer.html            # フッター（必須）
├─ blog/
│  └─ blog.css               # 記事用スタイル（お好みで）
├─ index.html                # トップページ（自動でブログセクションを差し込み）
└─ build-blog.mjs            # 変換スクリプト
```

> ※ `header.html` / `footer.html` は記事の骨格としてスクリプトが読み込みます。 

---

## `build-blog.yml`（サンプル）

> あなたの環境に合わせて調整できる、**最小ワークフロー例**です。（筆者も初心者なので全行コメント入れます🔰）

```yaml
name: Build Blog from Issues          # ワークフローの表示名

on:                                   # どのイベントで起動するか
  workflow_dispatch:                  # 手動実行ボタン（Actions 画面から実行可能）
  issues:                             # Issue 関連イベントをトリガーにする
    types: [opened, edited, labeled, unlabeled]  # 新規作成 / 編集 / ラベル追加 / ラベル削除

permissions:                          # GITHUB_TOKEN の権限スコープを明示
  contents: write                     # リポジトリ内容に書き込み（生成物の commit/push 用）
  issues: read                        # Issue 情報を読み取る

jobs:                                 # 実行するジョブ群
  build:                              # ジョブID（任意名）
    runs-on: ubuntu-latest            # GitHub が用意する Ubuntu ランナーで実行
    steps:                            # ジョブ内のステップ定義（順に実行）
      - name: Checkout                # リポジトリをランナーに取得
        uses: actions/checkout@v4     # 公式 checkout アクションを利用

      - name: Setup Node              # Node.js のセットアップ
        uses: actions/setup-node@v4   # 公式 Node セットアップアクション
        with:
          node-version: 20            # 使用する Node.js のバージョン

      - name: Install deps (if any)   # 依存パッケージインストール（package-lock があれば）
        run: npm ci || true           # 失敗してもワークフローを止めない（依存なし想定も許容）

      - name: Build blog              # ブログ静的生成処理
        env:                          # スクリプトに渡す環境変数
          REPO: ${{ github.repository }}          # owner/repo 形式（例 user/repo）
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}   # 自動付与トークン（API・push用）
          LABEL: blog                             # 収集対象 Issue のラベル名
          BLOG_DIR: blog                          # 出力先ディレクトリ
          # User/Org Pages なら "/", Project Pages なら "/<repo>/"
          SITE_BASE: /${{ github.event.repository.name }}/  # ルートに付けるベースパス
        run: node build-blog.mjs      # 生成スクリプトの実行

      - name: Commit & Push generated files       # 生成したファイルをコミット & プッシュ
        run: |                                    # 複数行シェル
          git config user.name  "github-actions[bot]"        # コミットユーザー名設定
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"  # メール設定
          git add -A                                 # 変更全て追加
          git commit -m "chore(blog): regenerate from issues [skip ci]" || echo "No changes" # 変更なければスキップ
          git push                                   # リモートへ反映
```

* **トリガー**は Issue の作成・編集・ラベル変更で実行。手動実行（`workflow_dispatch`）も可能。
* **トークン**は `secrets.GITHUB_TOKEN` をそのまま `GH_TOKEN` に渡します。GitHub API への認証と push に使います。
* **SITE_BASE** は Pages の公開形態に合わせます。**User/Org Pages → "/"、Project Pages → "/<repo>/"**。スクリプト側もこの前提で絶対URLを組み立てます。 

---

## [`build-blog.mjs` の中身（要点だけやさしく）](https://github.com/kuromelon257/kuromelon-hp/blob/main/scripts/build-blog.mjs)

> ここは「触るならこの辺」という**読みどころ**です。細部まで実装済みなので、まずはそのまま使えます。

### 1) Issue取得とフィルタ

* **ラベル `blog` かつ open** な Issue を最大100件取得
* **Pull Request は除外**
* **Issue番号 = 記事のパス**（例：`/blog/12/`）に採番します（わかりやすい！）。 

### 2) Markdown → HTML 変換（GitHub API）

* **GitHub Markdown API**で GFM 変換
* 変換前に **Twitter埋め込みや `class=""` / `style=""` を持つHTMLブロックを一時退避** → 変換後に**確実に復元**（壊れやすい埋め込みを丁寧に保護） 

### 3) 画像URLの自動修正

* `private-user-images.githubusercontent.com` のように**期限付きJWT**が付いたURLを、**`https://github.com/user-attachments/assets/<hash>`** 形式へ変換
* 古い `user-images.githubusercontent.com` 形式も必要に応じて変換
  → **期限切れで画像が消える事故を予防**します。 

### 4) コードブロックの整形

* GitHubのハイライトDOM（`<div class="highlight ..."><pre>...</pre></div>`）を、**highlight.js が処理しやすい `<pre><code class="language-xxx">`** に再構成
* 記事側では **CDNの highlight.js** を自動読み込みして**言語ラベルのバッジ**も表示します。 

### 5) SEOまわりを自動注入

* `<head>` に **title / canonical / description / OGP / Twitter Card / JSON-LD（BlogPosting）** を挿入
* 本文の**最初の画像をOGP**に採用（なければ既定画像）
* **rss.xml / sitemap.xml** まで自動生成（上位50件のRSS、月次クロール想定のsitemap）。 

### 6) トップページへのブログ差し込み

* `index.html` を読み取り、**“Works セクションの直後”**に **最新3件のブログカードセクション**を自動挿入
* 既存のブログセクションは**重複防止のため削除**してから差し込み。 

---

## 使い方：3ステップ

1. **テンプレートを置く**
   `templates/header.html`・`templates/footer.html` を用意（最低限のHTML骨格と `<main>` 用のコンテナがあればOK）。`blog/blog.css` はお好みのスタイルで。 
2. **ActionsとPagesを有効化**
   `build-blog.yml` を push。GitHub Pages を **mainブランチ**（または `docs/` など）から配信する設定にしておく。
3. **Issueを書く**
   タイトル＝記事タイトル、本文＝Markdown。**「blog」ラベル**を付けるだけで自動公開！

---

## よくあるハマりどころと対策

* **画像が表示されない**
  プライベート画像URL（JWT付き）は**自動で公開形式へ変換**しますが、うまくいかない画像があれば一度「Issueに画像をドラッグ&ドロップ」して**`user-attachments` 形式で貼り直す**のが確実です。 

* **URLの先頭 `/` が合わない**
  **User/Org Pages → `SITE_BASE="/"`、Project Pages → `SITE_BASE="/<repo>/"`** にしてください。OGPやRSSの**絶対URL**の生成に使います。 

* **スタイルが当たらない**
  記事ページで `blog.css` を読み込みます。**`/blog/blog.css` のパスに置く**前提になっているので、ファイルの場所を合わせてください。 

* **トップページのどこに差し込まれる？**
  `index.html` の **“Works セクションの終了タグ” を目印**に自動挿入します。構造が大きく違う場合は、一旦その行の直後に `<!-- Blog Section -->` を用意しておくと安全です。 

---

## カスタマイズのポイント

* **ラベル名**：`LABEL` 環境変数で変更可能（既定は `blog`）。**非公開の下書き**を避けるなら、公開用と下書き用でラベルを分けるのも◎。 
* **出力先**：`BLOG_DIR`（既定 `blog`）。URL構造を変えたいときに調整。 
* **サイトのオリジン**：`getSiteOrigin()` は **`https://kuromelon.com`** を返す仕様。**独自ドメインを使わない**場合はここを `https://<ユーザー名>.github.io/<リポジトリ名>` に変更するのが手っ取り早いです。 
* **OGP画像の既定値**：本文に画像がない場合は `assets/images/chackrun_thumb.jpg` を使います。自分のロゴに差し替えると統一感が出ます。 

---

## セキュリティと運用

* **トークン**：`secrets.GITHUB_TOKEN` を使うので、追加のPATは不要。権限はワークフロー内の `permissions` で最小に。
* **コスト**：公開リポジトリなら無料枠で十分。大規模でなければ私用ブログ運用に問題ありません。
* **公開タイミング**：Issue保存直後よりも、**ラベル付け**や**手動トリガー**で走らせると誤公開の心配が減ります。

---

## 仕組みの“技あり”まとめ

* **Issue番号＝パス**でURLが安定（スラッグ決めに悩まない） 
* **埋め込み保護 → Markdown変換 → 復元**で壊れにくいHTML生成 
* **画像URLの自動補正**で期限切れを回避し、SNSカードも安定表示 
* **RSS / sitemap / OGP / JSON-LD** まで自動化でSEO対応は一通り完備 
* **トップページへ最新3件を自動差し込み**で更新が見える化 

---

## 今後の改善点

## さいごに

「GitHubのIssueを書く＝ブログ更新」という**最短動線**は、忙しいエンジニアの継続にめちゃくちゃ効きます。まずはこの最小セットで回し、慣れてきたらデザインや生成ロジックを育てていきましょう。わからないところがあれば、そのままこのIssue-ブログ運用で**“質問記事”**として書いてしまうのもアリです。🚀

> 実装の要は `build-blog.mjs` にまとまっています。記事内で触れた動作（Issue取得・Markdown変換・画像URL補正・SEO注入・一覧/RSS/sitemap生成・トップ差し込み）は、すべてこのスクリプトで完結します。 
