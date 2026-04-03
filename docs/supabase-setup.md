# Supabase Setup

這個專案現在預設使用 Supabase 當資料儲存層。

## 1. 建立 Supabase project

到 Supabase 建一個新 project，然後拿到：

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## 2. 建資料表

到 Supabase SQL Editor 貼上 `supabase/schema.sql` 的內容執行。

## 3. 設定 `.env`

```env
STORE_PROVIDER=supabase
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
SUPABASE_EMAILS_TABLE=email_registrations
SUPABASE_ORDERS_TABLE=ebook_orders
SUPABASE_RECHARGE_CARDS_TABLE=recharge_cards
SUPABASE_BITREFILL_PURCHASES_TABLE=bitrefill_purchases
```

## 4. 啟動

```bash
npm install
npm start
```

## 備註

- `STORE_PROVIDER=memory` 只建議用在臨時本機測試，不會持久化。
- 正式 demo 或部署請用 Supabase。
- 前端 API 不需要改，還是打原本 backend endpoints。
