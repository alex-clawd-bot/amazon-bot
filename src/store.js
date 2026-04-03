import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export class FileStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.state = {
      emails: [],
      rechargeCards: [],
      orders: [],
      bitrefillPurchases: []
    };
  }

  async init() {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });

    try {
      const content = await fs.readFile(this.filePath, 'utf8');
      const parsed = JSON.parse(content);
      this.state = {
        emails: Array.isArray(parsed.emails) ? parsed.emails : [],
        rechargeCards: Array.isArray(parsed.rechargeCards) ? parsed.rechargeCards : [],
        orders: Array.isArray(parsed.orders) ? parsed.orders : [],
        bitrefillPurchases: Array.isArray(parsed.bitrefillPurchases) ? parsed.bitrefillPurchases : []
      };
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }

      await this.persist();
    }
  }

  getEmail(email) {
    const normalizedEmail = normalizeEmail(email);
    const record = this.state.emails.find((item) => item.email === normalizedEmail);
    return record ? clone(record) : null;
  }

  getEmailStatus(email) {
    const normalizedEmail = normalizeEmail(email);
    const emailRecord = this.state.emails.find((item) => item.email === normalizedEmail) ?? null;
    const order = this.state.orders.find((item) => item.email === normalizedEmail) ?? null;

    return {
      email: normalizedEmail,
      exists: Boolean(emailRecord),
      alreadySent: emailRecord?.status === 'ordered',
      status: emailRecord?.status ?? 'not_found',
      record: emailRecord ? clone(emailRecord) : null,
      order: order ? clone(order) : null
    };
  }

  getEmailStats() {
    const stats = {
      registeredEmails: this.state.emails.length,
      sentEmails: 0,
      pendingEmails: 0,
      processingEmails: 0,
      notSentEmails: 0,
      totalOrders: this.state.orders.length
    };

    for (const email of this.state.emails) {
      if (email.status === 'ordered') {
        stats.sentEmails += 1;
      } else if (email.status === 'processing') {
        stats.processingEmails += 1;
      } else {
        stats.pendingEmails += 1;
      }
    }

    stats.notSentEmails = stats.registeredEmails - stats.sentEmails;
    return clone(stats);
  }

  getOrderByEmail(email) {
    const normalizedEmail = normalizeEmail(email);
    const record = this.state.orders.find((item) => item.email === normalizedEmail);
    return record ? clone(record) : null;
  }

  getRechargeCard(code) {
    const normalizedCode = normalizeCode(code);
    const record = this.state.rechargeCards.find((item) => item.code === normalizedCode);
    return record ? clone(record) : null;
  }

  getBitrefillPurchaseById(purchaseId) {
    const record = this.state.bitrefillPurchases.find((item) => item.id === purchaseId);
    return record ? clone(record) : null;
  }

  async addEmail(email) {
    const normalizedEmail = normalizeEmail(email);
    const existing = this.state.emails.find((item) => item.email === normalizedEmail);

    if (existing) {
      return { email: clone(existing), created: false };
    }

    const now = new Date().toISOString();
    const record = {
      email: normalizedEmail,
      status: 'pending',
      createdAt: now,
      updatedAt: now
    };

    this.state.emails.push(record);
    await this.persist();

    return { email: clone(record), created: true };
  }

  async reserveRechargeCard(code) {
    const normalizedCode = normalizeCode(code);
    const existing = this.state.rechargeCards.find((item) => item.code === normalizedCode);

    if (existing) {
      return { rechargeCard: clone(existing), reserved: false };
    }

    const record = {
      code: normalizedCode,
      status: 'processing',
      providerRequestId: null,
      createdAt: new Date().toISOString(),
      redeemedAt: null
    };

    this.state.rechargeCards.push(record);
    await this.persist();

    return { rechargeCard: clone(record), reserved: true };
  }

  async completeRechargeCard(code, providerRequestId) {
    const normalizedCode = normalizeCode(code);
    const record = this.state.rechargeCards.find((item) => item.code === normalizedCode);

    if (!record) {
      throw new Error('RECHARGE_CARD_NOT_FOUND');
    }

    record.status = 'redeemed';
    record.providerRequestId = providerRequestId;
    record.redeemedAt = new Date().toISOString();
    await this.persist();

    return clone(record);
  }

  async releaseRechargeCard(code) {
    const normalizedCode = normalizeCode(code);
    const index = this.state.rechargeCards.findIndex((item) => item.code === normalizedCode && item.status === 'processing');

    if (index >= 0) {
      this.state.rechargeCards.splice(index, 1);
      await this.persist();
    }
  }

  async reserveOrderForEmail(email) {
    const normalizedEmail = normalizeEmail(email);
    const emailRecord = this.state.emails.find((item) => item.email === normalizedEmail);

    if (!emailRecord) {
      throw new Error('EMAIL_NOT_FOUND');
    }

    if (emailRecord.status !== 'pending') {
      return {
        email: clone(emailRecord),
        reserved: false,
        order: this.getOrderByEmail(normalizedEmail)
      };
    }

    emailRecord.status = 'processing';
    emailRecord.updatedAt = new Date().toISOString();
    await this.persist();

    return { email: clone(emailRecord), reserved: true, order: null };
  }

  async completeOrder({ email, ebookAsin, ebookTitle, providerOrderId }) {
    const normalizedEmail = normalizeEmail(email);
    const emailRecord = this.state.emails.find((item) => item.email === normalizedEmail);

    if (!emailRecord) {
      throw new Error('EMAIL_NOT_FOUND');
    }

    const existingOrder = this.state.orders.find((item) => item.email === normalizedEmail);
    if (existingOrder) {
      return { order: clone(existingOrder), created: false };
    }

    const now = new Date().toISOString();
    emailRecord.status = 'ordered';
    emailRecord.updatedAt = now;
    emailRecord.orderedAt = now;

    const order = {
      id: crypto.randomUUID(),
      email: normalizedEmail,
      ebookAsin,
      ebookTitle,
      providerOrderId,
      status: 'completed',
      createdAt: now
    };

    this.state.orders.push(order);
    await this.persist();

    return { order: clone(order), created: true };
  }

  async releaseOrder(email) {
    const normalizedEmail = normalizeEmail(email);
    const emailRecord = this.state.emails.find((item) => item.email === normalizedEmail);

    if (!emailRecord) {
      return;
    }

    if (emailRecord.status === 'processing') {
      emailRecord.status = 'pending';
      emailRecord.updatedAt = new Date().toISOString();
      await this.persist();
    }
  }

  async saveBitrefillPurchase({ amount, quantity, result, requestedByEmail = null }) {
    const now = new Date().toISOString();
    const record = {
      id: crypto.randomUUID(),
      requestedByEmail: requestedByEmail ? normalizeEmail(requestedByEmail) : null,
      amount,
      quantity,
      provider: 'bitrefill',
      invoice: result.invoice,
      product: result.product,
      orders: result.orders,
      redemptionCodes: result.redemptionCodes,
      createdAt: now
    };

    this.state.bitrefillPurchases.push(record);
    await this.persist();
    return clone(record);
  }

  async persist() {
    const content = JSON.stringify(this.state, null, 2);
    await fs.writeFile(this.filePath, content, 'utf8');
  }
}

export function normalizeEmail(email) {
  return String(email ?? '').trim().toLowerCase();
}

function normalizeCode(code) {
  return String(code ?? '').trim();
}
