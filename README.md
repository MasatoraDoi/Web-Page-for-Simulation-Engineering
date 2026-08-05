# ホタル共振デモ（GitHub Pages + Firebase）

講義用アプリです。生徒がボタンを押すと音が鳴り、教員が開始したセッション中だけタップ時刻が Firebase Realtime Database に保存されます。

> 以前の Google Apps Script + スプレッドシート方式は通信が不安定だったため、保存先を Firebase に切り替えました。  
> `apps-script/` は参考用の旧実装です（使用しません）。

## できること

- **生徒**（`index.html`）: 初回だけ数字 ID → ボタンと音量。受付中セッションがあるときだけ記録
- **教員**（`teacher.html`）: セッション名を入力して開始 / 終了
- セッション状態は **リアルタイム同期**（ポーリング不要）

## 全体構成

```
生徒/教員のブラウザ（GitHub Pages）
        │  Firebase JS SDK
        ▼
Firebase Realtime Database
  meta/activeSession          … いま受付中か
  sessions/{name}/meta        … 開始・終了
  sessions/{name}/taps/{id}   … studentId / timestamp / recordedAt
```

可視化や CSV 書き出しは、あとで別に決めます。当面は Firebase コンソールで確認できます。

## セットアップ手順

### 1. Firebase プロジェクトを作る

1. [Firebase Console](https://console.firebase.google.com/) を開く（個人 Google アカウントで可）
2. **プロジェクトを追加**（例: `firefly-sync`）
3. 左メニュー **Build → Realtime Database → データベースを作成**
   - 場所: 近いリージョン（例: `asia-southeast1`）
   - 最初は **ロックモード** でも、次のルールで上書きします

### 2. セキュリティルール

Realtime Database の **ルール** タブで、講義用の簡易ルールを設定して公開します。

```json
{
  "rules": {
    "meta": {
      "activeSession": {
        ".read": true,
        ".write": true
      }
    },
    "sessions": {
      "$sessionKey": {
        ".read": true,
        ".write": true
      }
    }
  }
}
```

> URL が分かると誰でも読み書きできます。講義用の使い捨てプロジェクトにし、終わったらルールを締めるかプロジェクトを削除してください。

### 3. Web アプリ設定を取得

1. プロジェクト概要の横 **</>**（ウェブアプリを追加）
2. ニックネーム例: `github-pages`
3. 表示される `firebaseConfig` の値を控える

### 4. このリポジトリの設定

`js/config.js` に貼ります。

```js
window.APP_CONFIG = {
  FIREBASE: {
    apiKey: '...',
    authDomain: '...',
    databaseURL: 'https://xxxx.firebaseio.com', // または https://xxxx.firebasedatabase.app
    projectId: '...',
    storageBucket: '...',
    messagingSenderId: '...',
    appId: '...',
  },
};
```

`databaseURL` が空だと動きません。Realtime Database の「データ」タブ上部の URL を確認してください。

### 5. GitHub Pages で公開

1. 変更を commit / push
2. **Settings → Pages** で `main` / `/ (root)` を公開
3. 生徒: `https://<user>.github.io/<repo>/`
4. 教員: `https://<user>.github.io/<repo>/teacher.html`（生徒に共有しない）

## データの見方（当面）

Firebase Console → Realtime Database → データ

例:

```
sessions
  test1
    meta: { status, startedAt, endedAt, sessionName }
    taps
      -Nxxxx: { studentId, timestamp, recordedAt }
```

グラフ用の横軸は、これまでどおり **`timestamp`（押した瞬間）** を使ってください。

## ローカル確認

```bash
python3 -m http.server 8080
```

`http://localhost:8080/` と `http://localhost:8080/teacher.html` を開きます。

## 注意

- 生徒 ID・時刻は Firebase に保存されます
- ルールを公開している間は、URL を知っている人が書き込めます
- スマホでも Firebase SDK 経由なら、旧 Apps Script のようなタイムアウトは起きにくいです
