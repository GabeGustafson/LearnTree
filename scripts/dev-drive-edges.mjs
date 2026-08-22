// Visual check for the dependency-edge redesign and module-text wrapping.
import { chromium } from 'playwright-core';

const OUT = '/tmp/learntree-shots';
const base = 'http://localhost:5173';

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await (await browser.newContext({ viewport: { width: 1700, height: 1050 } })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));

// Fresh sample state so screenshots are deterministic
await page.goto(`${base}/#/`, { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.clear());

await page.goto(`${base}/#/tree/cpp-basics`, { waitUntil: 'networkidle' });
await page.waitForSelector('text=Modern Idioms', { timeout: 20000 });
await page.waitForTimeout(1100); // layout + fitView
await page.screenshot({ path: `${OUT}/edges-1-canvas.png`, fullPage: false });

// Long-section module row wrapping
await page.locator('button:has-text("RAII & Move Semantics")').first().click();
await page.waitForSelector('text=Effective Modern C++');
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/edges-2-panel.png` });

console.log('PAGE ERRORS:', errors.length === 0 ? 'none' : errors.join('\n'));
await browser.close();
console.log('edge/text drive done');
