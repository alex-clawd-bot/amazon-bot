function createDisabledClient() {
  return {
    name: 'disabled',
    enabled: false,
    async purchaseAmazonGiftCard() {
      const error = new Error('Bitrefill is not configured. Set BITREFILL_API_KEY or BITREFILL_API_ID/BITREFILL_API_SECRET.');
      error.statusCode = 503;
      throw error;
    }
  };
}

export function createBitrefillClient(config, fetchImpl = fetch) {
  if (!config.bitrefillApiKey && !(config.bitrefillApiId && config.bitrefillApiSecret)) {
    return createDisabledClient();
  }

  return new BitrefillClient(config, fetchImpl);
}

class BitrefillClient {
  constructor(config, fetchImpl) {
    this.config = config;
    this.fetchImpl = fetchImpl;
    this.name = 'bitrefill';
    this.enabled = true;
  }

  async purchaseAmazonGiftCard({ amount, quantity = 1 }) {
    const product = await this.resolveAmazonProduct();
    const invoice = await this.createInvoice({
      products: [{
        product_id: product.id,
        value: amount,
        quantity
      }],
      payment_method: this.config.bitrefillPaymentMethod,
      auto_pay: this.config.bitrefillPaymentMethod === 'balance'
    });

    let hydratedInvoice = invoice;
    if (this.config.bitrefillPaymentMethod === 'balance' && !isInvoicePaid(invoice)) {
      hydratedInvoice = await this.payInvoice(invoice.id);
    }

    const orderIds = collectOrderIds(hydratedInvoice);
    if (orderIds.length === 0) {
      hydratedInvoice = await this.getInvoiceById(invoice.id);
    }

    const finalOrderIds = collectOrderIds(hydratedInvoice);
    if (finalOrderIds.length === 0) {
      const error = new Error('Bitrefill invoice did not return any order IDs.');
      error.statusCode = 502;
      throw error;
    }

    const orders = [];
    for (const orderId of finalOrderIds) {
      orders.push(await this.waitForOrderDelivery(orderId));
    }

    return {
      invoice: summarizeInvoice(hydratedInvoice),
      product: summarizeProduct(product),
      orders: orders.map(summarizeOrder),
      redemptionCodes: orders.flatMap(extractRedemptionCodes)
    };
  }

  async resolveAmazonProduct() {
    if (this.config.bitrefillAmazonProductId) {
      const product = await this.getProductById(this.config.bitrefillAmazonProductId);
      return ensureAmazonGiftCardProduct(product);
    }

    const result = await this.get('/products/search', {
      q: this.config.bitrefillAmazonProductQuery
    });

    const products = normalizeList(result)
      .map((item) => item.product ?? item)
      .filter(Boolean);

    const match = products.find(matchesConfiguredAmazonProduct)
      ?? products.find((item) => textForProduct(item).includes('amazon.com'))
      ?? products[0];

    if (!match) {
      const error = new Error('Could not find an Amazon.com Gift Card product in Bitrefill search results.');
      error.statusCode = 404;
      throw error;
    }

    return ensureAmazonGiftCardProduct(match);
  }

  async createInvoice(payload) {
    return this.post('/invoices', payload);
  }

  async payInvoice(invoiceId) {
    return this.post(`/invoices/${encodeURIComponent(invoiceId)}/pay`, {});
  }

  async getInvoiceById(invoiceId) {
    return this.get(`/invoices/${encodeURIComponent(invoiceId)}`);
  }

  async getOrderById(orderId) {
    return this.get(`/orders/${encodeURIComponent(orderId)}`);
  }

  async getProductById(productId) {
    return this.get(`/products/${encodeURIComponent(productId)}`);
  }

  async waitForOrderDelivery(orderId) {
    const timeoutAt = Date.now() + this.config.bitrefillOrderTimeoutMs;

    while (Date.now() < timeoutAt) {
      const order = await this.getOrderById(orderId);
      const status = String(order.status ?? '').toLowerCase();

      if (status === 'delivered') {
        return order;
      }

      if (['failed', 'refunded', 'cancelled'].includes(status)) {
        const error = new Error(`Bitrefill order ${orderId} ended with status ${status}.`);
        error.statusCode = 409;
        error.order = order;
        throw error;
      }

      await sleep(this.config.bitrefillPollIntervalMs);
    }

    const error = new Error(`Timed out waiting for Bitrefill order ${orderId} to be delivered.`);
    error.statusCode = 504;
    throw error;
  }

  async get(pathname, query = null) {
    return this.request('GET', pathname, { query });
  }

  async post(pathname, body) {
    return this.request('POST', pathname, { body });
  }

  async request(method, pathname, { query, body } = {}) {
    const url = new URL(`/v2${pathname}`, this.config.bitrefillBaseUrl);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value != null && value !== '') {
          url.searchParams.set(key, String(value));
        }
      }
    }

    const response = await this.fetchImpl(url, {
      method,
      headers: {
        accept: 'application/json',
        ...buildAuthHeaders(this.config),
        ...(body ? { 'content-type': 'application/json' } : {})
      },
      body: body ? JSON.stringify(body) : undefined
    });

    const text = await response.text();
    const data = text ? safeJsonParse(text) : null;

    if (!response.ok) {
      const message = data?.message ?? data?.error ?? text ?? `Bitrefill request failed with status ${response.status}`;
      const error = new Error(message);
      error.statusCode = response.status;
      error.response = data ?? text;
      throw error;
    }

    return unwrapResponse(data);
  }
}

function buildAuthHeaders(config) {
  if (config.bitrefillApiKey) {
    return { authorization: `Bearer ${config.bitrefillApiKey}` };
  }

  const token = Buffer.from(`${config.bitrefillApiId}:${config.bitrefillApiSecret}`).toString('base64');
  return { authorization: `Basic ${token}` };
}

function unwrapResponse(payload) {
  if (payload && typeof payload === 'object' && payload.data) {
    return payload.data;
  }

  return payload;
}

function normalizeList(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (Array.isArray(payload?.items)) {
    return payload.items;
  }

  if (Array.isArray(payload?.results)) {
    return payload.results;
  }

  if (Array.isArray(payload?.products)) {
    return payload.products;
  }

  return [];
}

function matchesConfiguredAmazonProduct(product) {
  const text = textForProduct(product);
  return text.includes('amazon.com') && text.includes('gift');
}

function ensureAmazonGiftCardProduct(product) {
  if (!matchesConfiguredAmazonProduct(product)) {
    const error = new Error('Configured Bitrefill product is not clearly an Amazon.com gift card product.');
    error.statusCode = 422;
    throw error;
  }

  return product;
}

function textForProduct(product) {
  return [
    product?.name,
    product?.title,
    product?.description,
    product?.brand,
    product?.country?.name,
    product?.countryCode,
    product?.region,
    product?.operator?.name,
    product?.category?.name
  ].filter(Boolean).join(' ').toLowerCase();
}

function isInvoicePaid(invoice) {
  const status = String(invoice?.status ?? '').toLowerCase();
  return ['paid', 'processing', 'completed', 'delivered'].includes(status);
}

function collectOrderIds(invoice) {
  const candidates = [];

  const orders = invoice?.orders ?? invoice?.line_items ?? invoice?.items ?? [];
  for (const item of orders) {
    const orderId = item?.order_id ?? item?.orderId ?? item?.id ?? item?.order?.id;
    if (orderId) {
      candidates.push(String(orderId));
    }
  }

  if (invoice?.order_id) {
    candidates.push(String(invoice.order_id));
  }

  return [...new Set(candidates)];
}

function summarizeInvoice(invoice) {
  return {
    id: invoice?.id ?? null,
    status: invoice?.status ?? null,
    totalPrice: invoice?.price ?? invoice?.total_price ?? invoice?.totalPrice ?? null,
    paymentMethod: invoice?.payment_method ?? invoice?.paymentMethod ?? null
  };
}

function summarizeProduct(product) {
  return {
    id: product?.id ?? null,
    name: product?.name ?? product?.title ?? null,
    countryCode: product?.countryCode ?? product?.country?.code ?? null,
    minValue: product?.min_value ?? product?.minValue ?? null,
    maxValue: product?.max_value ?? product?.maxValue ?? null
  };
}

function summarizeOrder(order) {
  return {
    id: order?.id ?? null,
    status: order?.status ?? null,
    product: order?.product ?? null,
    redemptionInfo: order?.redemption_info ?? order?.redemptionInfo ?? null
  };
}

function extractRedemptionCodes(order) {
  const info = order?.redemption_info ?? order?.redemptionInfo;
  if (!info) {
    return [];
  }

  const bucket = Array.isArray(info) ? info : [info];
  return bucket.map((entry) => ({
    code: entry?.code ?? entry?.claim_code ?? entry?.claimCode ?? null,
    pin: entry?.pin ?? null,
    link: entry?.link ?? entry?.url ?? null,
    instructions: entry?.instructions ?? null
  }));
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
