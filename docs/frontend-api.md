# Frontend API Contract

這份文件是給 frontend / UI agent 直接使用的 API 規格。

Base URL 範例：

```ts
const API_BASE_URL = 'http://localhost:3000';
```

## 目標功能

目前前端先做這 3 件事就夠了：

1. 使用者輸入 email 註冊
2. 檢查某個 email 是否已經註冊 / 是否已經送過書
3. 顯示總共有多少 email 註冊、多少已送出

## Email 狀態定義

```ts
export type EmailDeliveryStatus = 'not_found' | 'pending' | 'processing' | 'ordered';
```

- `not_found`: 尚未註冊
- `pending`: 已註冊，尚未送書
- `processing`: 正在送書流程中
- `ordered`: 已送書完成

## TypeScript Types

```ts
export type EmailDeliveryStatus = 'not_found' | 'pending' | 'processing' | 'ordered';

export interface EmailRecord {
  email: string;
  status: Exclude<EmailDeliveryStatus, 'not_found'>;
  createdAt: string;
  updatedAt: string;
  orderedAt?: string;
}

export interface OrderRecord {
  id: string;
  email: string;
  ebookAsin: string;
  ebookTitle: string;
  providerOrderId: string;
  status: 'completed';
  createdAt: string;
}

export interface EmailStatusResponse {
  status: {
    email: string;
    exists: boolean;
    alreadySent: boolean;
    status: EmailDeliveryStatus;
    record: EmailRecord | null;
    order: OrderRecord | null;
  };
}

export interface RegisterEmailResponse {
  created: boolean;
  status: {
    email: string;
    exists: boolean;
    alreadySent: boolean;
    status: EmailDeliveryStatus;
    record: EmailRecord | null;
    order: OrderRecord | null;
  };
  stats: StatsResponse['stats'];
}

export interface StatsResponse {
  stats: {
    registeredEmails: number;
    sentEmails: number;
    pendingEmails: number;
    processingEmails: number;
    notSentEmails: number;
    totalOrders: number;
  };
}

export interface ApiErrorResponse {
  error: string;
}
```

## 1) Register Email

### Request

`POST /api/emails`

```json
{
  "email": "user@example.com"
}
```

### Success Response

- 新 email：HTTP `201`
- 已存在 email：HTTP `200`

```json
{
  "created": true,
  "status": {
    "email": "user@example.com",
    "exists": true,
    "alreadySent": false,
    "status": "pending",
    "record": {
      "email": "user@example.com",
      "status": "pending",
      "createdAt": "2026-04-03T10:00:00.000Z",
      "updatedAt": "2026-04-03T10:00:00.000Z"
    },
    "order": null
  },
  "stats": {
    "registeredEmails": 12,
    "sentEmails": 4,
    "pendingEmails": 8,
    "processingEmails": 0,
    "notSentEmails": 8,
    "totalOrders": 4
  }
}
```

### Error Response

HTTP `400`

```json
{
  "error": "A valid email is required."
}
```

## 2) Check Email Status

### Request

`GET /api/emails/status?email=user@example.com`

### Success Response

這個 API 即使 email 不存在，也會回 HTTP `200`。

#### Not registered

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

#### Registered but not sent

```json
{
  "status": {
    "email": "user@example.com",
    "exists": true,
    "alreadySent": false,
    "status": "pending",
    "record": {
      "email": "user@example.com",
      "status": "pending",
      "createdAt": "2026-04-03T10:00:00.000Z",
      "updatedAt": "2026-04-03T10:00:00.000Z"
    },
    "order": null
  }
}
```

#### Already sent

```json
{
  "status": {
    "email": "user@example.com",
    "exists": true,
    "alreadySent": true,
    "status": "ordered",
    "record": {
      "email": "user@example.com",
      "status": "ordered",
      "createdAt": "2026-04-03T10:00:00.000Z",
      "updatedAt": "2026-04-03T10:05:00.000Z",
      "orderedAt": "2026-04-03T10:05:00.000Z"
    },
    "order": {
      "id": "order-id",
      "email": "user@example.com",
      "ebookAsin": "B0EXAMPLE123",
      "ebookTitle": "Your Kindle Ebook",
      "providerOrderId": "provider-order-id",
      "status": "completed",
      "createdAt": "2026-04-03T10:05:00.000Z"
    }
  }
}
```

### Error Response

HTTP `400`

```json
{
  "error": "A valid email is required."
}
```

## 3) Get Stats

### Request

`GET /api/stats`

### Success Response

HTTP `200`

```json
{
  "stats": {
    "registeredEmails": 12,
    "sentEmails": 4,
    "pendingEmails": 8,
    "processingEmails": 0,
    "notSentEmails": 8,
    "totalOrders": 4
  }
}
```

## Suggested Frontend Flow

## Page load

1. 呼叫 `GET /api/stats`
2. 顯示：
   - 已註冊數量 `registeredEmails`
   - 已送出數量 `sentEmails`

## User input email

1. 使用者輸入 email
2. 可在 blur 時呼叫 `GET /api/emails/status?email=...`
3. UI 可依 `status.status` 顯示：
   - `not_found` → 可以註冊
   - `pending` → 已註冊，等待送出
   - `processing` → 正在處理
   - `ordered` → 已送出

## User clicks register

1. 呼叫 `POST /api/emails`
2. 如果成功：
   - 用 response 裡的 `status` 更新 email 顯示
   - 用 response 裡的 `stats` 更新統計卡片
3. 如果失敗：
   - 顯示 `error`

## UI Copy Suggestions

可直接給 UI 用的文案：

```ts
export function getEmailStatusLabel(status: EmailDeliveryStatus): string {
  switch (status) {
    case 'not_found':
      return 'Not registered yet';
    case 'pending':
      return 'Registered';
    case 'processing':
      return 'Sending';
    case 'ordered':
      return 'Sent';
  }
}
```

```ts
export function getEmailStatusDescription(status: EmailDeliveryStatus): string {
  switch (status) {
    case 'not_found':
      return 'This email has not registered yet.';
    case 'pending':
      return 'This email is registered and waiting to receive the ebook.';
    case 'processing':
      return 'This email is being processed now.';
    case 'ordered':
      return 'This email has already received the ebook.';
  }
}
```

## Minimal API Client Example

```ts
export async function registerEmail(apiBaseUrl: string, email: string): Promise<RegisterEmailResponse> {
  const response = await fetch(`${apiBaseUrl}/api/emails`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email })
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || 'Failed to register email');
  }

  return payload;
}

export async function getEmailStatus(apiBaseUrl: string, email: string): Promise<EmailStatusResponse> {
  const response = await fetch(
    `${apiBaseUrl}/api/emails/status?email=${encodeURIComponent(email)}`
  );

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || 'Failed to fetch email status');
  }

  return payload;
}

export async function getStats(apiBaseUrl: string): Promise<StatsResponse> {
  const response = await fetch(`${apiBaseUrl}/api/stats`);
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error || 'Failed to fetch stats');
  }

  return payload;
}
```
