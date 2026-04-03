import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { chromium } from 'playwright';

export class AmazonAutomationClient {
  constructor(config) {
    this.config = config;
    this.contextPromise = null;
    this.currentHeadless = null;
  }

  async bootstrapLogin() {
    const context = await this.getContext({ headless: false });
    const page = context.pages()[0] ?? await context.newPage();

    await page.goto(`${this.config.amazonBaseUrl}/ap/signin`, { waitUntil: 'domcontentloaded' });

    const startedAt = Date.now();
    while (Date.now() - startedAt < 10 * 60 * 1000) {
      if (await isSignedIn(page)) {
        await page.goto(`${this.config.amazonBaseUrl}/`, { waitUntil: 'domcontentloaded' });
        return { ok: true, storagePath: this.config.amazonUserDataDir };
      }

      await page.waitForTimeout(1000);
    }

    const error = new Error('Timed out waiting for Amazon login to complete.');
    error.code = 'AMAZON_LOGIN_TIMEOUT';
    throw error;
  }

  async redeemGiftCard({ code }) {
    return this.withPage(async (page) => {
      await page.goto(`${this.config.amazonBaseUrl}/gc/redeem`, { waitUntil: 'domcontentloaded' });
      await ensureSignedIn(page);
      await dismissCommonOverlays(page);

      await fillFirst(page, [
        '#gc-redemption-input',
        'input[name="claimCode"]',
        'input[placeholder*="claim code" i]',
        'input[aria-label*="claim code" i]'
      ], code);

      await clickFirstByNames(page, ['Apply to Your Balance', 'Apply to your balance', 'Redeem', 'Apply']);
      await page.waitForTimeout(2500);

      const pageText = await getPageText(page);
      const lowerText = pageText.toLowerCase();
      if (matchesAny(lowerText, [
        'already claimed',
        'already redeemed',
        'invalid claim code',
        'cannot be applied',
        'something went wrong'
      ])) {
        const error = new Error('Amazon rejected the gift card redeem request.');
        error.code = 'AMAZON_REDEEM_FAILED';
        error.details = pageText.slice(0, 2000);
        throw error;
      }

      return {
        providerRequestId: `redeem_${crypto.randomUUID()}`,
        accepted: true,
        currentUrl: page.url()
      };
    }, 'redeem-gift-card');
  }

  async orderEbookGift({ email, ebookAsin, ebookTitle }) {
    return this.withPage(async (page) => {
      await page.goto(`${this.config.amazonBaseUrl}/dp/${ebookAsin}`, { waitUntil: 'domcontentloaded' });
      await ensureSignedIn(page);
      await dismissCommonOverlays(page);

      const openedGiftFlow = await tryOpenGiftFlow(page);
      if (!openedGiftFlow) {
        const error = new Error('Could not find a Kindle gifting control on the product page.');
        error.code = 'AMAZON_GIFT_FLOW_NOT_FOUND';
        throw error;
      }

      await page.waitForTimeout(1500);
      await dismissCommonOverlays(page);

      await fillFirst(page, [
        'input[type="email"]',
        'input[name*="recipient" i]',
        'input[name*="email" i]',
        'input[placeholder*="email" i]',
        'input[aria-label*="email" i]'
      ], email);

      await fillOptional(page, [
        'textarea[name*="message" i]',
        'textarea[placeholder*="message" i]',
        'textarea',
        'input[name*="message" i]'
      ], this.config.amazonGiftMessage);

      await clickProgressButtons(page);
      await page.waitForTimeout(3000);

      const pageText = await getPageText(page);
      const lowerText = pageText.toLowerCase();
      if (matchesAny(lowerText, [
        'was sent to',
        'thank you, your order has been placed',
        'order placed',
        'gift email will be sent',
        'we have accepted your order'
      ])) {
        return {
          providerOrderId: extractOrderId(pageText) ?? `order_${crypto.randomUUID()}`,
          accepted: true,
          currentUrl: page.url(),
          ebookTitle
        };
      }

      if (matchesAny(lowerText, [
        'cannot purchase ebooks for others',
        'must be in your country/region',
        'something went wrong',
        'unable to complete your purchase',
        'there was a problem'
      ])) {
        const error = new Error('Amazon rejected the ebook gift order.');
        error.code = 'AMAZON_ORDER_FAILED';
        error.details = pageText.slice(0, 2000);
        throw error;
      }

      return {
        providerOrderId: extractOrderId(pageText) ?? `order_${crypto.randomUUID()}`,
        accepted: true,
        currentUrl: page.url(),
        ebookTitle,
        note: 'Order submitted, but confirmation text was not confidently detected. Check Amazon order history if needed.'
      };
    }, 'send-ebook-gift');
  }

  async getContext({ headless } = {}) {
    const desiredHeadless = headless ?? this.config.amazonHeadless;

    if (!this.contextPromise) {
      this.currentHeadless = desiredHeadless;
      this.contextPromise = this.launchContext(desiredHeadless);
      return this.contextPromise;
    }

    if (this.currentHeadless !== desiredHeadless) {
      const currentContext = await this.contextPromise;
      await currentContext.close();
      this.currentHeadless = desiredHeadless;
      this.contextPromise = this.launchContext(desiredHeadless);
    }

    return this.contextPromise;
  }

  async close() {
    if (!this.contextPromise) {
      return;
    }

    const context = await this.contextPromise;
    await context.close();
    this.contextPromise = null;
    this.currentHeadless = null;
  }

  async launchContext(headless) {
    await fs.mkdir(this.config.amazonUserDataDir, { recursive: true });
    await fs.mkdir(this.config.amazonDebugDir, { recursive: true });

    const launchOptions = {
      headless,
      slowMo: this.config.amazonSlowMoMs,
      viewport: { width: 1440, height: 1100 }
    };

    if (this.config.amazonBrowserChannel) {
      launchOptions.channel = this.config.amazonBrowserChannel;
    }

    return chromium.launchPersistentContext(this.config.amazonUserDataDir, launchOptions);
  }

  async withPage(action, label) {
    const context = await this.getContext();
    const page = await context.newPage();

    try {
      return await action(page);
    } catch (error) {
      const screenshotPath = await captureFailureScreenshot(page, this.config.amazonDebugDir, label);
      error.screenshotPath = screenshotPath;
      throw error;
    } finally {
      await page.close().catch(() => {});
    }
  }
}

async function ensureSignedIn(page) {
  if (!(await isSignedIn(page))) {
    const error = new Error('Amazon session is not signed in. Run `npm run amazon:login` first.');
    error.code = 'AMAZON_SESSION_REQUIRED';
    throw error;
  }
}

async function isSignedIn(page) {
  if (page.url().includes('/ap/signin')) {
    return false;
  }

  const signInFormVisible = await anyVisible(page, [
    'input[name="email"]',
    '#ap_email',
    'input[name="password"]',
    '#ap_password'
  ]);

  return !signInFormVisible;
}

async function tryOpenGiftFlow(page) {
  const directNames = [
    'Buy for others',
    'Buy For Others',
    'Give as a gift',
    'Give as Gift',
    'Give now'
  ];

  if (await clickFirstByNames(page, directNames, { required: false })) {
    return true;
  }

  if (await clickFirst(page, [
    '#buyForOthers',
    '[data-action="buy-for-others"]',
    'input[name="submit.buy-for-others"]'
  ], { required: false })) {
    return true;
  }

  return false;
}

async function clickProgressButtons(page) {
  const buttonNames = [
    'Continue',
    'Save gift options',
    'Place your order',
    'Complete purchase',
    'Send now',
    'Buy now',
    'Buy now with 1-Click'
  ];

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const clicked = await clickFirstByNames(page, buttonNames, { required: false });
    if (!clicked) {
      break;
    }

    await page.waitForTimeout(1800);

    const text = (await getPageText(page)).toLowerCase();
    if (matchesAny(text, ['order placed', 'thank you, your order has been placed', 'was sent to'])) {
      break;
    }
  }
}

async function dismissCommonOverlays(page) {
  await clickFirstByNames(page, ['No thanks', 'Not now', 'Continue shopping', 'Dismiss'], { required: false });
}

async function fillOptional(page, selectors, value) {
  if (!value) {
    return false;
  }

  return fillFirst(page, selectors, value, { required: false });
}

async function fillFirst(page, selectors, value, options = {}) {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    if (await isLocatorVisible(locator)) {
      await locator.fill(value);
      return true;
    }
  }

  if (options.required === false) {
    return false;
  }

  const error = new Error(`Could not find an input for selectors: ${selectors.join(', ')}`);
  error.code = 'AMAZON_INPUT_NOT_FOUND';
  throw error;
}

async function clickFirst(page, selectors, options = {}) {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    if (await isLocatorVisible(locator)) {
      await locator.click();
      return true;
    }
  }

  if (options.required === false) {
    return false;
  }

  const error = new Error(`Could not find a clickable element for selectors: ${selectors.join(', ')}`);
  error.code = 'AMAZON_CLICK_TARGET_NOT_FOUND';
  throw error;
}

async function clickFirstByNames(page, names, options = {}) {
  for (const name of names) {
    for (const role of ['button', 'link']) {
      const locator = page.getByRole(role, { name, exact: false }).first();
      if (await isLocatorVisible(locator)) {
        await locator.click();
        return true;
      }
    }
  }

  if (options.required === false) {
    return false;
  }

  const error = new Error(`Could not find a button or link named: ${names.join(', ')}`);
  error.code = 'AMAZON_ACTION_NOT_FOUND';
  throw error;
}

async function anyVisible(page, selectors) {
  for (const selector of selectors) {
    if (await isLocatorVisible(page.locator(selector).first())) {
      return true;
    }
  }

  return false;
}

async function isLocatorVisible(locator) {
  try {
    return await locator.isVisible({ timeout: 1200 });
  } catch {
    return false;
  }
}

async function getPageText(page) {
  return page.locator('body').innerText().catch(() => '');
}

function matchesAny(text, needles) {
  return needles.some((needle) => text.includes(needle));
}

function extractOrderId(text) {
  const match = text.match(/order\s*(?:#|number)?\s*[:]?\s*([0-9-]{8,})/i);
  return match?.[1] ?? null;
}

async function captureFailureScreenshot(page, debugDir, label) {
  const fileName = `${new Date().toISOString().replace(/[:.]/g, '-')}-${label}.png`;
  const filePath = path.join(debugDir, fileName);

  try {
    await page.screenshot({ path: filePath, fullPage: true });
    return filePath;
  } catch {
    return null;
  }
}
