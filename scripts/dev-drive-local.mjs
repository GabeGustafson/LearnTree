// M4 agent-loop rehearsal, fully in-browser: showDirectoryPicker is overridden
// to return an OPFS directory (a real FileSystemDirectoryHandle), so the whole
// local-folder pipeline — walk, read, write progress.json, reload-on-focus,
// last-good substitution — runs against genuine FS Access semantics.
import { chromium } from 'playwright-core';

const OUT = '/tmp/learntree-shots';
const base = 'http://localhost:5173';

const GOOD_TREE = `learntree: 1
id: demo
title: Demo Tree
nodes:
  - id: a
    title: Node A
    categories:
      - name: Resources
        modules:
          - id: m1
            title: Module One
            url: "https://example.com/1"
          - id: m2
            title: Module Two
            url: "https://example.com/2"
`;

const EDITED_TREE = GOOD_TREE.replace('title: Node A', 'title: Node A (edited)');
const BROKEN_TREE = 'learntree: 1\nid: [\n';

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 1500, height: 950 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (err) => errors.push(String(err)));

await page.addInitScript(() => {
  window.showDirectoryPicker = async () => {
    const root = await navigator.storage.getDirectory();
    return root.getDirectoryHandle('forest', { create: true });
  };
  window.__forestWrite = async (path, text) => {
    const root = await navigator.storage.getDirectory();
    let dir = await root.getDirectoryHandle('forest', { create: true });
    const parts = path.split('/');
    for (const part of parts.slice(0, -1)) {
      dir = await dir.getDirectoryHandle(part, { create: true });
    }
    const fh = await dir.getFileHandle(parts.at(-1), { create: true });
    const w = await fh.createWritable();
    await w.write(text);
    await w.close();
  };
  window.__forestRead = async (path) => {
    const root = await navigator.storage.getDirectory();
    let dir = await root.getDirectoryHandle('forest');
    const parts = path.split('/');
    for (const part of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(part);
    const fh = await dir.getFileHandle(parts.at(-1));
    return (await fh.getFile()).text();
  };
});

const write = (path, text) => page.evaluate(([p, t]) => window.__forestWrite(p, t), [path, text]);
const read = (path) => page.evaluate((p) => window.__forestRead(p), path);
const refocus = async () => {
  await page.waitForTimeout(5300); // store throttles focus reloads to 5s
  await page.evaluate(() => {
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('focus'));
  });
  await page.waitForTimeout(600);
};
const step = (msg) => console.log(`✔ ${msg}`);

await page.goto(`${base}/#/settings`, { waitUntil: 'networkidle' });
await write('forest.yaml', 'learntree: 1\nname: Local Rehearsal\n');
await write('trees/demo.yaml', GOOD_TREE);

// 1. Connect the "folder"
await page.click('text=Open local folder…');
await page.waitForSelector('text=folder: forest', { timeout: 10000 });
step('connected to local folder');

// 2. Open the tree, toggle m1
await page.goto(`${base}/#/tree/demo`, { waitUntil: 'networkidle' });
await page.locator('button:has-text("Node A")').first().click();
await page.waitForSelector('text=Module One');
await page.locator('aside button[title="Mark done"]').first().click();
await page.waitForTimeout(1200); // > persist debounce
const progress1 = JSON.parse(await read('.learntree/progress.json'));
if (progress1.modules.m1?.state !== 'done') throw new Error('m1 not persisted to progress.json');
step('toggle persisted to .learntree/progress.json');

// 3. External edit + refocus → new content, checkmark intact
await write('trees/demo.yaml', EDITED_TREE);
await refocus();
await page.waitForSelector('button:has-text("Node A (edited)")', { timeout: 10000 });
await page.screenshot({ path: `${OUT}/m4-1-edited.png` });
const doneCount = await page.locator('aside .bg-green-600').count();
if (doneCount < 1) throw new Error('checkmark lost after external edit');
step('external edit picked up on refocus; checkmark intact');

// 4. Corrupt the file → last-good render + banner
await write('trees/demo.yaml', BROKEN_TREE);
await refocus();
await page.waitForSelector('text=problem', { timeout: 10000 });
const stillRendered = await page.locator('button:has-text("Node A (edited)")').count();
if (stillRendered === 0) throw new Error('last-good version not rendered');
await page.screenshot({ path: `${OUT}/m4-2-lastgood.png` });
step('corrupt file → error banner + last-good render');

// 5. Fix, uncheck, reload → stays unchecked (tombstone)
await write('trees/demo.yaml', EDITED_TREE);
await refocus();
await page.locator('button:has-text("Node A (edited)")').first().click();
await page.locator('aside button.bg-green-600').first().click(); // uncheck m1
await page.waitForTimeout(1200);
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('button:has-text("Node A (edited)")', { timeout: 10000 });
await page.locator('button:has-text("Node A (edited)")').first().click();
await page.waitForSelector('text=Module One');
const greenAfter = await page.locator('aside button.bg-green-600').count();
if (greenAfter !== 0) throw new Error('uncheck resurrected after reload');
const progress2 = JSON.parse(await read('.learntree/progress.json'));
if (progress2.modules.m1?.state !== 'undone') throw new Error('tombstone missing in file');
step('uncheck survives full reload (tombstone in file)');

console.log('PAGE ERRORS:', errors.length === 0 ? 'none' : errors.join('\n'));
await browser.close();
console.log('M4 rehearsal: ALL PASS');
