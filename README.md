# Amazon Bot Backend

一個輕量後端，提供幾個 API：

1. Amazon 充值卡兌換
2. Amazon 電子書下單 / 贈送
3. 新增 email 名單
4. 透過 Bitrefill API 購買 Amazon.com Gift Card code

業務規則：

- 所有人收到的是同一本電子書
- 一個 email 只能收到一次
- email 必須先加入，才能下單送書

## Quick start

```bash
cp .env.example .env
npm install
npm start
```

預設使用 `mock` provider，不會真的對 Amazon 下單；只會模擬成功並落資料。

## 前端最先會用到的 API
前端完整 handoff 文件在 `docs/frontend-api.md`。


### `POST /api/emails`

註冊 email。

```json
{
  "email": "user@example.com"
}
```

回傳：

- `created`: 這次是不是新註冊
- `status.exists`: email 是否已註冊
- `status.alreadySent`: 這個 email 是否已經送過書
- `stats.registeredEmails`: 已註冊總數
- `stats.sentEmails`: 已送出總數

### `GET /api/emails/status?email=user@example.com`

前端檢查某個 email 是否已註冊、是否已送過。

即使 email 不存在，也會回 `200`，方便前端直接判斷：

```json
{
  "status": {
    "email": "user@example.com",
    "exists": false,
    "alreadySent": false,
    "status": "not_found",
    "record": null,
    "order": null
  }
}
```

### `GET /api/stats`

給前端顯示數字：

```json
{
  "stats": {
    "registeredEmails": 10,
    "sentEmails": 4,
    "pendingEmails": 6,
    "processingEmails": 0,
    "notSentEmails": 6,
    "totalOrders": 4
  }
}
```

### `GET /api/emails/:email`

舊的明細查詢接口，email 不存在時會回 `404`。

## 其他 API

### `POST /api/bitrefill/amazon-gift-cards/purchase`

向 Bitrefill 買 Amazon.com Gift Card code。

```json
{
  "amount": 25,
  "quantity": 1,
  "requestedByEmail": "ops@example.com"
}
```

### `GET /api/bitrefill/purchases/:id`

查已購買的 Bitrefill 記錄與 code。

### `POST /api/amazon/recharge-cards/redeem`

```json
{
  "code": "ABCD-EFGH-IJKL"
}
```

### `POST /api/amazon/orders`

```json
{
  "email": "user@example.com"
}
```

## 環境變數

- `PORT`: backend API port
- `DATA_FILE`: JSON 儲存檔路徑
- `AMAZON_PROVIDER`: `mock` 或 `webhook`
- `AMAZON_AUTOMATION_URL`: webhook provider 的外部自動化服務網址
- `AMAZON_AUTOMATION_TOKEN`: webhook provider 的 Bearer token
- `AMAZON_EBOOK_ASIN`: 固定送出的電子書 ASIN
- `AMAZON_EBOOK_TITLE`: 固定送出的電子書名稱
- `AMAZON_AUTOMATION_PORT`: automation service port
- `AMAZON_BASE_URL`: 預設 `https://www.amazon.com`
- `AMAZON_USER_DATA_DIR`: Playwright 持久化登入 session 目錄
- `AMAZON_HEADLESS`: automation service 是否無頭模式
- `AMAZON_SLOW_MO_MS`: 操作放慢，方便 debug
- `AMAZON_GIFT_MESSAGE`: 送書時附帶訊息
- `AMAZON_BROWSER_CHANNEL`: 可指定 `chrome` 等 browser channel
- `AMAZON_DEBUG_DIR`: automation 失敗時截圖存放位置
- `BITREFILL_BASE_URL`: Bitrefill API base URL，預設 `https://api.bitrefill.com`
- `BITREFILL_API_KEY`: Bitrefill Personal Access Token；如果有這個就用 Bearer auth
- `BITREFILL_API_ID`: Bitrefill business API id；和 `BITREFILL_API_SECRET` 一起走 Basic auth
- `BITREFILL_API_SECRET`: Bitrefill business API secret
- `BITREFILL_PAYMENT_METHOD`: 預設 `balance`
- `BITREFILL_AMAZON_PRODUCT_ID`: 如果你知道產品 id，可直接指定，最穩
- `BITREFILL_AMAZON_PRODUCT_QUERY`: 預設搜尋 `Amazon.com Gift Card`
- `BITREFILL_POLL_INTERVAL_MS`: 建單後輪詢 order 的間隔
- `BITREFILL_ORDER_TIMEOUT_MS`: 等待拿到 code 的 timeout

## Bitrefill 流程

這個 backend 目前會依照 Bitrefill 官方 API 的常見流程做：

1. 搜尋 `Amazon.com Gift Card` product
2. 建立 invoice
3. 用 Bitrefill `balance` 付款
4. 查 invoice / order
5. 輪詢到 order delivered
6. 把 `redemptionCodes` 存進本地資料檔

## 真的操作 Amazon 的 automation service

這個 repo 也包含一個 Playwright automation service，對外提供：

- `POST /redeem-gift-card`
- `POST /send-ebook-gift`
- `GET /health`

### 1) 安裝瀏覽器

```bash
npm run playwright:install
```

### 2) 先登入 Amazon 一次

```bash
npm run amazon:login
```

會開一個真的瀏覽器。你手動登入 Amazon、完成 2FA 後，session 會存在 `AMAZON_USER_DATA_DIR`。

### 3) 啟動 automation service

```bash
npm run automation:start
```

### 4) 讓 backend 改用真的 automation

`.env` 這樣設：

```env
AMAZON_PROVIDER=webhook
AMAZON_AUTOMATION_URL=http://127.0.0.1:3001
AMAZON_EBOOK_ASIN=你的電子書ASIN
AMAZON_EBOOK_TITLE=你的電子書名稱
```

然後再啟 backend：

```bash
npm start
```
