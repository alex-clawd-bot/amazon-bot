# Railway Deploy Guide

這份是給你把目前這個專案部署到 Railway 用的最短路徑。

## 架構

目前建議使用：

- **1 個 Railway service**
- 同一個 Node server 同時提供：
  - frontend UI (`/`)
  - backend API (`/api/*`)

也就是說，不需要拆成前後端兩個 service。

## 部署前準備

你需要先有一個 Supabase project，並執行：

- `supabase/schema.sql`

你需要準備以下環境變數：

```env
STORE_PROVIDER=supabase
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
AMAZON_PROVIDER=mock
AMAZON_EBOOK_ASIN=B0EXAMPLE123
AMAZON_EBOOK_TITLE=Your Kindle Ebook
```

## 用 GitHub 連 Railway

### 1. 建立新專案

- 到 Railway 建立新 project
- 選 `Deploy from GitHub repo`
- 選這個 repo

### 2. Root 目錄

- Root directory 保持 repo 根目錄即可

### 3. Build / Start

這個 repo 已經有：

- `package.json`
- `railway.json`

Railway 會用：

- Build: `Railpack`
- Start: `npm start`

## 要設定的 Railway Variables

把以下值加到 Railway service 的 Variables：

### 必填

```env
STORE_PROVIDER=supabase
SUPABASE_URL=你的 Supabase Project URL
SUPABASE_SERVICE_ROLE_KEY=你的 Supabase Service Role Key
```

### 建議 demo 用

```env
AMAZON_PROVIDER=mock
AMAZON_EBOOK_ASIN=B0GDG6D3WP
AMAZON_EBOOK_TITLE=Your Kindle Ebook
```

### 可選

如果你要接 Bitrefill：

```env
BITREFILL_API_KEY=...
```

或：

```env
BITREFILL_API_ID=...
BITREFILL_API_SECRET=...
```

## 上線後檢查

部署完成後，先檢查：

- `/health`
- `/api/stats`
- `/`

例如：

```bash
curl https://your-app.up.railway.app/health
curl https://your-app.up.railway.app/api/stats
```

## Demo 建議設定

如果你現在只是 demo，建議：

```env
AMAZON_PROVIDER=mock
```

這樣你可以先完整展示：

- UI 首頁
- email 查詢
- email 加入
- stats 統計

而不需要先把 Amazon automation service 一起部署。

## 之後如果要上真的 Amazon automation

那時候再拆成第 2 個 Railway service：

- Service A: 主網站 + API
- Service B: Playwright automation

主網站這邊再設定：

```env
AMAZON_PROVIDER=webhook
AMAZON_AUTOMATION_URL=https://your-automation-service.up.railway.app
```

## CLI 方式

如果你想用 Railway CLI：

```bash
railway login
railway up
```

部署後再去 Dashboard 補環境變數即可。

## 快速 Checklist

- [ ] Supabase project 已建立
- [ ] `supabase/schema.sql` 已執行
- [ ] Railway project 已建立
- [ ] GitHub repo 已連上 Railway
- [ ] `SUPABASE_URL` 已設定
- [ ] `SUPABASE_SERVICE_ROLE_KEY` 已設定
- [ ] `STORE_PROVIDER=supabase` 已設定
- [ ] `AMAZON_PROVIDER=mock` 已設定
- [ ] 打開 `/` 確認 UI 正常
- [ ] 打開 `/api/stats` 確認 API 正常
