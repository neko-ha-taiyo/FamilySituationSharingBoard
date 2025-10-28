# 家族状況共有アプリ

家族メンバーの状況をリアルタイムで共有できるWebアプリケーションです。

## 機能

- **状況表示**: 家族全員の現在の状況を一覧表示
- **状況更新**: スマートフォンでも押しやすい大きなボタンで簡単に状況を更新
- **自動更新**: 設定した間隔で自動的に状況をポーリング
- **設定画面**: ポーリング間隔を1〜300秒の範囲で自由に設定可能
- **レスポンシブデザイン**: スマートフォン、タブレット、PCに対応

## セットアップ

### 1. 依存パッケージのインストール

```bash
npm install
```

### 2. サーバーの起動

お試しで起動する場合
```bash
npm start
```

または開発モード（自動再起動）で起動:

```bash
npm run dev
```

初めて常時起動しておけるようにする場合:

```bash
# アプリケーションのルートディレクトリに移動する.
cd /home/hardlitchi/workspaces/signal
# 常時起動の設定をして起動する.
pm2 start npm --name "Familly board" -- start
# 常時起動の設定を保存する.
pm2 save
```

2回目以降の起動など、修正して再起動する場合

```bash
# 既存アプリケーション起動設定のIDを確認する.
# (このアプリの name は、 Familly board)
pm2 list
# 既存のアプリケーションを再起動する.
pm2 restart <上記で確認したID>
```

### 3. アプリケーションにアクセス

ブラウザで以下のURLを開きます:

```bash
# server.js L:7 で設定している.
http://localhost:3003

# 実際にアクセス可能なドメインは、https://manage.proxy.hidearea.net で設定している.
https://signal.sb.hidearea.net
```

## 使い方

### 状況の更新

1. 画面上部の「名前」ドロップダウンから自分の名前を選択
2. 状況ボタンをタップして現在の状況を更新
   - 在宅
   - 仕事中
   - 学校
   - 外出中
   - 買い物
   - 食事中
   - 忙しい
   - ヒマ

### 設定の変更

1. 右上の「⚙️ 設定」ボタンをタップ
2. 「更新間隔」に希望する秒数を入力（1〜300秒）
3. 「保存」ボタンをタップ

設定した間隔で自動的に家族の状況が更新されます。

## ファイル構成

```
.
├── server.js              # Express サーバー
├── index.html             # メインHTML
├── style.css              # スタイルシート
├── app.js                 # フロントエンドJavaScript
├── package.json           # npm設定
├── family-status.json     # データ保存ファイル（自動生成）
└── README.md              # このファイル
```

## 技術スタック

- **バックエンド**: Node.js + Express
- **フロントエンド**: Vanilla JavaScript + CSS3
- **データ保存**: JSONファイル

## カスタマイズ

### 家族メンバーの追加

`index.html` の `<select id="userName">` セクションを編集してメンバーを追加できます:

```html
<select id="userName">
    <option value="">選択してください</option>
    <option value="お父さん">お父さん</option>
    <option value="お母さん">お母さん</option>
    <option value="子ども1">子ども1</option>
    <option value="子ども2">子ども2</option>
    <!-- ここに追加 -->
</select>
```

### 状況ボタンの追加

`index.html` の `<div class="status-buttons">` セクションにボタンを追加できます:

```html
<button class="status-btn custom" data-status="カスタム状況">絵文字 カスタム状況</button>
```

対応するCSSスタイルも `style.css` に追加してください:

```css
.status-btn.custom { background: linear-gradient(135deg, #color1 0%, #color2 100%); }
```

## ライセンス

MIT
