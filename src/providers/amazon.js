import crypto from 'node:crypto';

export function createAmazonProvider(config) {
  if (config.amazonProvider === 'webhook') {
    return createWebhookProvider(config);
  }

  return createMockProvider();
}

function createMockProvider() {
  return {
    name: 'mock',
    async redeemGiftCard({ code }) {
      return {
        providerRequestId: `redeem_${crypto.randomUUID()}`,
        accepted: true,
        code
      };
    },
    async orderEbookGift({ email, ebookAsin, ebookTitle }) {
      return {
        providerOrderId: `order_${crypto.randomUUID()}`,
        accepted: true,
        email,
        ebookAsin,
        ebookTitle
      };
    }
  };
}

function createWebhookProvider(config) {
  if (!config.amazonAutomationUrl) {
    throw new Error('AMAZON_AUTOMATION_URL is required when AMAZON_PROVIDER=webhook');
  }

  async function postJson(endpoint, payload) {
    const response = await fetch(new URL(endpoint, config.amazonAutomationUrl), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(config.amazonAutomationToken
          ? { authorization: `Bearer ${config.amazonAutomationToken}` }
          : {})
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(`Amazon automation failed: ${response.status} ${message}`);
    }

    return response.json();
  }

  return {
    name: 'webhook',
    async redeemGiftCard({ code }) {
      const result = await postJson('/redeem-gift-card', { code });
      return {
        providerRequestId: result.providerRequestId ?? result.id ?? `redeem_${crypto.randomUUID()}`,
        accepted: true,
        raw: result
      };
    },
    async orderEbookGift({ email, ebookAsin, ebookTitle }) {
      const result = await postJson('/send-ebook-gift', { email, ebookAsin, ebookTitle });
      return {
        providerOrderId: result.providerOrderId ?? result.id ?? `order_${crypto.randomUUID()}`,
        accepted: true,
        raw: result
      };
    }
  };
}
