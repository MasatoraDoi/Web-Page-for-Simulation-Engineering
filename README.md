# ホタル共振デモ（GitHub Pages + Google スプレッドシート）

講義用アプリです。生徒がボタンを押すと音が鳴り、教員が開始したセッション中だけタップ時刻が Google スプレッドシートに保存されます。

## できること

- **生徒**（`index.html`）: 初回だけ数字 ID を入力 → ボタンと音量スライダー。受付中セッションがあるときだけ記録
- **教員**（`teacher.html`）: セッション名を入力して開始 / 終了

## なぜスプレッドシートに書けるのか

GitHub Pages は静的サイトなので、スプレッドシートへ**直接**は書き込めません。  
代わりに **Google Apps Script のウェブアプリ**を用意し、ページからそこに `POST` します。Apps Script がスプレッドシートへ追記します。

```
生徒/教員のブラウザ（GitHub Pages）
        │  fetch
        ▼
Google Apps Script（ウェブアプリ URL）
        │
        ▼
Google スプレッドシート
  - Sessions（開始/終了）
  - Taps（誰がいつ押したか）
```

## セットアップ手順

### 1. スプレッドシートと Apps Script

1. [Google スプレッドシート](https://sheets.google.com) で新規作成
2. **拡張機能 → Apps Script**
3. エディタのコードをすべて消し、リポジトリの `apps-script/Code.gs` の内容を貼り付けて保存
4. **デプロイ → 新しいデプロイ**
   - 種類の選択: **ウェブアプリ**
   - 説明: 任意（例: firefly v1）
   - 次のユーザーとして実行: **自分**
   - アクセスできるユーザー: **全員**
5. デプロイ後に表示される **ウェブアプリ URL** をコピー

> コードを直したら、再度「デプロイ → デプロイを管理 → 編集（鉛筆）→ 新バージョン」で更新してください。URL は同じままでも、バージョンを上げないと反映されないことがあります。

### 2. このリポジトリ側の設定

`js/config.js` を開き、URL を貼ります。

```js
window.APP_CONFIG = {
  APPS_SCRIPT_URL: 'https://script.google.com/macros/s/XXXX/exec',
};
```

### 3. GitHub Pages で公開

1. このリポジトリを GitHub に push
2. リポジトリの **Settings → Pages**
3. Source を **Deploy from a branch** にし、`main`（または `docs`）の `/ (root)` を選択
4. 数分待つと次の URL で公開されます。
   - 生徒用: `https://<user>.github.io/<repo>/`
   - 教員用: `https://<user>.github.io/<repo>/teacher.html`

生徒ページと教員ページのあいだにリンクはありません。教員用 URL は生徒に共有しないでください。

## シートの見方

初回の開始操作で次のシートが自動作成されます。

| シート | 内容 |
|---|---|
| `Sessions` | sessionName / status(`active` or `ended`) / startedAt / endedAt |
| `Taps` | sessionName / studentId / timestamp（生徒端末の時刻） / recordedAt（サーバー受信時刻） |

あとで「誰がいつ押したか」は `Taps` をセッション名でフィルタすると確認できます。

## 講義での使い方（例）

1. 教員が `teacher.html` でセッション名を入れて **開始**
2. 生徒がページを開き、出席番号などで ID を入力
3. 実験中にボタンを押す（音が鳴り、同時に記録）
4. 教員が **終了**
5. スプレッドシートの `Taps` を見て解析

## ローカル確認

`config.js` に URL を入れたあと、簡易サーバーで開けます。

```bash
python3 -m http.server 8080
```

ブラウザで `http://localhost:8080/` と `http://localhost:8080/teacher.html` を開いてください。

## 注意

- 生徒の ID・時刻は Google 側に保存されます。講義用途の範囲で運用してください
- ウェブアプリを「全員」に公開しているため、URL が知られると書き込み可能です。講義用の使い捨てシートにするか、終了後にデプロイを止めると安心です
- スマホのブラウザは、最初のタップで音声が有効になる仕様です（本アプリではボタン操作で再生可能です）
