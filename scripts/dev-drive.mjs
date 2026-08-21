import { chromium } from 'playwright-core';

const OUT = '/tmp/learntree-shots';
const base = 'http://localhost:5173';

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await (await browser.newContext({ viewport: { width: 1600, height: 1000 } })).newPage();

const errors = [];
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(msg.text());
});
page.on('pageerror', (err) => errors.push(String(err)));

// 1. Dashboard
await page.goto(`${base}/#/`, { waitUntil: 'networkidle' });
await page.waitForSelector('text=Sample Forest', { timeout: 20000 });
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/1-dashboard.png` });

// 2. Tree canvas
await page.goto(`${base}/#/tree/cpp-basics`, { waitUntil: 'networkidle' });
await page.waitForSelector('text=Pointers & References', { timeout: 20000 });
await page.waitForTimeout(900); // fitView animation
await page.screenshot({ path: `${OUT}/2-canvas.png` });

// 3. Open node panel
await page.click('text=Pointers & References');
await page.waitForSelector('text=Pointer kata', { timeout: 10000 });
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/3-panel.png` });

// 4. Toggle some modules to exercise statuses (incl. equivalence grey checks)
await page.goto(`${base}/#/tree/systems`, { waitUntil: 'networkidle' });
await page.waitForSelector('text=Address Spaces', { timeout: 20000 });
await page.click('text=Address Spaces');
await page.waitForSelector('text=OSTEP — Ch. 13', { timeout: 10000 });
const boxes = page.locator('aside button[title="Mark done"]');
const n = await boxes.count();
for (let i = 0; i < n; i++) await boxes.first().click();
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/4-systems-checked.png` });

// 5. Back to cpp tree: pointers video should now be grey-satisfied
await page.goto(`${base}/#/tree/cpp-basics`, { waitUntil: 'networkidle' });
await page.waitForSelector('text=Pointers & References', { timeout: 20000 });
await page.click('text=Pointers & References');
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/5-satisfied.png` });

console.log('CONSOLE ERRORS:', errors.length === 0 ? 'none' : errors.join('\n---\n'));
await browser.close();
