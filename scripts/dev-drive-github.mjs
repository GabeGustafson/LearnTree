// M5 rehearsal: the real GitHubProvider + SyncController running in the
// browser against a scripted api.github.com (Playwright route interception).
// Exercises ref/tree/blob loading, contents PUT, and the 409 → merge → retry
// path with a cross-"device" edit.
import { chromium } from 'playwright-core';

const base = 'http://localhost:5173';
const OUT = '/tmp/learntree-shots';

const TREE_YAML = `learntree: 1
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
const FOREST_YAML = 'learntree: 1\nname: GitHub Rehearsal\n';

const b64 = (s) => Buffer.from(s, 'utf8').toString('base64');
const fromB64 = (s) => Buffer.from(s, 'base64').toString('utf8');

// ---- scripted repo state ----
const repo = {
  refSha: 'ref-1',
  blobs: { b1: FOREST_YAML, b2: TREE_YAML },
  progress: null, // { text, sha }
  putCount: 0,
  conflictArmed: false,
};

function json(status, body) {
  return { status, contentType: 'application/json', body: JSON.stringify(body) };
}

function handle(url, method, postData) {
  const path = url.pathname;
  if (method === 'GET' && path === '/repos/fake/forest') return json(200, { id: 1 });
  if (method === 'GET' && path === '/repos/fake/forest/git/ref/heads/main') {
    return json(200, { object: { sha: repo.refSha } });
  }
  if (method === 'GET' && path === `/repos/fake/forest/git/trees/${repo.refSha}`) {
    return json(200, {
      truncated: false,
      tree: [
        { path: 'forest.yaml', type: 'blob', sha: 'b1' },
        { path: 'trees/demo.yaml', type: 'blob', sha: 'b2' },
      ],
    });
  }
  const blob = path.match(/^\/repos\/fake\/forest\/git\/blobs\/(.+)$/);
  if (method === 'GET' && blob) {
    const text = repo.blobs[blob[1]];
    return text === undefined
      ? json(404, { message: 'Not Found' })
      : json(200, { content: b64(text), encoding: 'base64' });
  }
  if (path === '/repos/fake/forest/contents/.learntree/progress.json') {
    if (method === 'GET') {
      return repo.progress === null
        ? json(404, { message: 'Not Found' })
        : json(200, { content: b64(repo.progress.text), sha: repo.progress.sha });
    }
    if (method === 'PUT') {
      const body = JSON.parse(postData);
      const expected = repo.progress?.sha ?? null;
      if ((body.sha ?? null) !== expected || repo.conflictArmed) {
        repo.conflictArmed = false;
        return json(409, { message: 'is at a different sha' });
      }
      repo.putCount += 1;
      repo.progress = { text: fromB64(body.content), sha: `p-${repo.putCount}` };
      repo.lastMessage = body.message;
      return json(201, { content: { sha: repo.progress.sha } });
    }
  }
  return json(404, { message: `unhandled ${method} ${path}` });
}

// ---- drive ----
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await (await browser.newContext({ viewport: { width: 1500, height: 950 } })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));

await page.route('https://api.github.com/**', (route) => {
  const req = route.request();
  const res = handle(new URL(req.url()), req.method(), req.postData());
  return route.fulfill(res);
});

const step = (m) => console.log(`✔ ${m}`);

await page.goto(`${base}/#/settings`, { waitUntil: 'networkidle' });
await page.click('text=Connect GitHub repo…');
await page.fill('input[placeholder="your-username"]', 'fake');
await page.fill('input[placeholder="my-learning-forest"]', 'forest');
await page.fill('input[placeholder="github_pat_…"]', 'github_pat_test');

await page.click('text=Test connection');
await page.waitForSelector('text=✓ Connection works', { timeout: 10000 });
step('test connection reports success');

await page.getByRole('button', { name: 'Connect', exact: true }).click();
await page.waitForSelector('text=fake/forest@main', { timeout: 10000 });
step('connected; forest loaded from scripted repo');

// Toggle m1 done → first PUT creates the file
await page.goto(`${base}/#/tree/demo`, { waitUntil: 'networkidle' });
await page.locator('button:has-text("Node A")').first().click();
await page.waitForSelector('text=Module One');
await page.locator('aside button[title="Mark done"]').first().click();
await page.waitForFunction(() => true, null, { timeout: 100 }).catch(() => {});
await page.waitForTimeout(3500); // > 2.5s debounce
if (repo.progress === null) throw new Error('PUT never arrived');
let doc = JSON.parse(repo.progress.text);
if (doc.modules.m1?.state !== 'done') throw new Error('m1 not in committed progress');
if (!repo.lastMessage.includes('Module One')) throw new Error(`bad commit message: ${repo.lastMessage}`);
step(`progress committed (message: "${repo.lastMessage}")`);

// Simulate another device: out-of-band commit adds m2, changing the sha
repo.progress = {
  text: JSON.stringify({
    learntree: 1,
    modules: {
      ...doc.modules,
      m2: { state: 'done', at: '2026-08-21T00:00:00.000Z' },
    },
  }),
  sha: 'p-external',
};
step('external device committed m2 (sha now p-external)');

// Uncheck m1 → stale-sha PUT → 409 → merge → retry: final has m1 tombstone + m2 done
await page.locator('aside button.bg-green-600').first().click();
await page.waitForTimeout(16000); // 10s spacing + 409 + backoff + retry
doc = JSON.parse(repo.progress.text);
if (doc.modules.m1?.state !== 'undone') throw new Error(`m1 should be undone, got ${JSON.stringify(doc.modules.m1)}`);
if (doc.modules.m2?.state !== 'done') throw new Error('m2 from the other device was lost in the merge');
step('conflict merged: local uncheck kept (tombstone), remote m2 preserved');

// The merged m2 should now show as done in the UI too
await page.waitForSelector('aside button.bg-green-600', { timeout: 10000 });
await page.screenshot({ path: `${OUT}/m5-github.png` });
step('UI reflects merged remote progress');

console.log('PAGE ERRORS:', errors.length === 0 ? 'none' : errors.join('\n'));
await browser.close();
console.log('M5 rehearsal: ALL PASS');
