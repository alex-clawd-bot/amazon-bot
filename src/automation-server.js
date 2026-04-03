import http from 'node:http';
import { loadConfig } from './config.js';
import { AmazonAutomationClient } from './automation.js';

const config = loadConfig();
const automation = new AmazonAutomationClient(config);

const server = http.createServer(async (request, response) => {
  try {
    if (request.method === 'GET' && request.url === '/health') {
      return sendJson(response, 200, {
        ok: true,
        amazonBaseUrl: config.amazonBaseUrl,
        userDataDir: config.amazonUserDataDir
      });
    }

    if (request.method === 'POST' && request.url === '/redeem-gift-card') {
      ensureAuthorized(request, config);
      const body = await readJson(request);
      const code = String(body.code ?? '').trim();

      if (!code) {
        return sendJson(response, 400, { error: 'A gift card code is required.' });
      }

      const result = await automation.redeemGiftCard({ code });
      return sendJson(response, 200, result);
    }

    if (request.method === 'POST' && request.url === '/send-ebook-gift') {
      ensureAuthorized(request, config);
      const body = await readJson(request);
      const email = String(body.email ?? '').trim().toLowerCase();
      const ebookAsin = String(body.ebookAsin ?? '').trim();
      const ebookTitle = String(body.ebookTitle ?? '').trim();

      if (!email || !ebookAsin) {
        return sendJson(response, 400, { error: 'Both email and ebookAsin are required.' });
      }

      const result = await automation.orderEbookGift({ email, ebookAsin, ebookTitle });
      return sendJson(response, 200, result);
    }

    return sendJson(response, 404, { error: 'Route not found.' });
  } catch (error) {
    return sendJson(response, mapStatusCode(error), {
      error: error.message,
      code: error.code ?? 'INTERNAL_ERROR',
      details: error.details,
      screenshotPath: error.screenshotPath ?? null
    });
  }
});

server.listen(config.automationPort, () => {
  console.log(`amazon automation listening on http://localhost:${config.automationPort}`);
});

process.on('SIGINT', async () => {
  await automation.close().catch(() => {});
  server.close(() => process.exit(0));
});

process.on('SIGTERM', async () => {
  await automation.close().catch(() => {});
  server.close(() => process.exit(0));
});

async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }

  if (chunks.length === 0) {
    return {};
  }

  const raw = Buffer.concat(chunks).toString('utf8');

  try {
    return JSON.parse(raw);
  } catch {
    const error = new Error('Invalid JSON body.');
    error.code = 'INVALID_JSON';
    throw error;
  }
}

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body, null, 2));
}

function ensureAuthorized(request, config) {
  if (!config.amazonAutomationToken) {
    return;
  }

  const header = request.headers.authorization ?? '';
  const expected = `Bearer ${config.amazonAutomationToken}`;
  if (header !== expected) {
    const error = new Error('Unauthorized automation request.');
    error.code = 'UNAUTHORIZED';
    throw error;
  }
}

function mapStatusCode(error) {
  switch (error.code) {
    case 'INVALID_JSON':
    case 'AMAZON_INPUT_NOT_FOUND':
    case 'AMAZON_ACTION_NOT_FOUND':
    case 'AMAZON_CLICK_TARGET_NOT_FOUND':
      return 400;
    case 'UNAUTHORIZED':
      return 401;
    case 'AMAZON_SESSION_REQUIRED':
      return 412;
    case 'AMAZON_GIFT_FLOW_NOT_FOUND':
      return 422;
    case 'AMAZON_REDEEM_FAILED':
    case 'AMAZON_ORDER_FAILED':
      return 409;
    default:
      return 500;
  }
}
