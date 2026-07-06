import { chromium } from 'playwright';

export async function openWhatsApp({ userDataDir, headless }) {
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless,
    viewport: { width: 1440, height: 920 },
  });
  const page = context.pages()[0] || await context.newPage();
  await page.goto('https://web.whatsapp.com/', { waitUntil: 'domcontentloaded' });
  await waitForWhatsApp(page);
  return { context, page };
}

export async function sendMessage(page, target, message) {
  const phone = normalizePhone(target.phone || target.chatId || '');
  if (!phone) throw new Error(`Cannot send WhatsApp message: empty phone/chatId (${target.chatId || ''})`);
  const url = `https://web.whatsapp.com/send?phone=${encodeURIComponent(phone)}&text=${encodeURIComponent(message)}`;
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await waitForComposer(page);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(900);
  return { phone, messageLength: message.length };
}

export async function readUnreadMessages(page, options = {}) {
  const limit = options.limit || 5;
  await page.goto('https://web.whatsapp.com/', { waitUntil: 'domcontentloaded' });
  await waitForWhatsApp(page);
  return await page.evaluate((maxItems) => {
    const rows = Array.from(document.querySelectorAll('[role="row"], div[tabindex="-1"]'));
    const unreadRows = rows.filter((row) => {
      const text = row.innerText || '';
      return /непрочитан|unread/i.test(text) || row.querySelector('[aria-label*="unread" i], [aria-label*="непрочитан" i]');
    });
    return unreadRows.slice(0, maxItems).map((row) => {
      const text = row.innerText || '';
      const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
      return {
        name: lines[0] || 'WhatsApp',
        phone: null,
        text: lines[lines.length - 1] || '',
      };
    }).filter((item) => item.text);
  }, limit);
}

async function waitForWhatsApp(page) {
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(1500);
}

async function waitForComposer(page) {
  const selectors = [
    'div[contenteditable="true"][data-tab="10"]',
    'div[contenteditable="true"][role="textbox"]',
    'footer div[contenteditable="true"]',
  ];
  for (const selector of selectors) {
    const locator = page.locator(selector).last();
    try {
      await locator.waitFor({ state: 'visible', timeout: 15000 });
      return locator;
    } catch (error) {
      // Try next selector.
    }
  }
  throw new Error('WhatsApp composer was not found. Check QR login or selectors.');
}

function normalizePhone(value) {
  const raw = String(value || '').replace(/@c\.us$/i, '');
  const digits = raw.replace(/\D/g, '');
  return digits || '';
}
