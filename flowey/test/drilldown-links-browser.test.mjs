import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { fileURLToPath } from 'node:url';
import { ChromeVisualBrowser, findChrome } from '../bin/visual-check.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Drill-down decks: an overview page links nodes to sibling detail pages and
// each detail page links back. Clicking (or Enter) must open the target in a
// new tab. Uses the shipped shop example pair so the skill recipe stays tested.
test('drill-down links open detail pages in a new tab with keyboard support', async (t) => {
  if (!Object.hasOwn(process.env, 'FLOWEY_CHROME')) return t.skip('Set FLOWEY_CHROME for real browser checks');
  const chrome = findChrome();
  assert.ok(chrome);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'flowey-drilldown-'));
  const run = (args) => execFileSync(process.execPath, [path.join(root, 'bin/flowey.mjs'), ...args], { encoding: 'utf8' });
  for (const name of ['shop-overview', 'shop-frontend', 'shop-backend']) {
    fs.copyFileSync(path.join(root, 'examples', `${name}.architecture.json`), path.join(dir, `${name}.json`));
  }
  const overview = path.join(dir, 'shop-overview.html');
  const frontend = path.join(dir, 'shop-frontend.html');
  const backend = path.join(dir, 'shop-backend.html');
  run(['render', 'architecture', path.join(dir, 'shop-overview.json'), overview]);
  run(['render', 'architecture', path.join(dir, 'shop-frontend.json'), frontend]);
  run(['render', 'architecture', path.join(dir, 'shop-backend.json'), backend]);
  fs.writeFileSync(path.join(dir, 'up.json'), JSON.stringify({ storefront: 'shop-frontend.html', api: 'shop-backend.html' }));
  fs.writeFileSync(path.join(dir, 'front-back.json'), JSON.stringify({ pages: 'shop-overview.html', checkout: 'shop-overview.html', cdn: 'shop-overview.html' }));
  fs.writeFileSync(path.join(dir, 'back-back.json'), JSON.stringify({ router: 'shop-overview.html', orders: 'shop-overview.html', stock: 'shop-overview.html' }));
  run(['links', overview, '--map', path.join(dir, 'up.json')]);
  run(['links', frontend, '--map', path.join(dir, 'front-back.json')]);
  run(['links', backend, '--map', path.join(dir, 'back-back.json')]);

  const browser = new ChromeVisualBrowser(chrome);
  try {
    const session = await browser.sessionPromise;
    const send = (method, params = {}) => browser.cdp.send(method, params, session);
    const evaluate = async (expression) => {
      const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      assert.equal(result.exceptionDetails, undefined);
      return result.result?.value;
    };
    const loaded = browser.cdp.waitFor('Page.loadEventFired', session);
    await send('Page.navigate', { url: pathToFileURL(overview).href });
    await loaded;
    const opened = await evaluate(`(() => {
      const opened = [];
      window.open = (u, target, features) => { opened.push([u, target, features]); return null; };
      for (const id of ['node-storefront', 'node-api']) {
        document.getElementById(id).dispatchEvent(new MouseEvent('click', { bubbles: true }));
      }
      document.getElementById('node-api').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      document.getElementById('node-storefront').dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
      return opened;
    })()`);
    assert.deepEqual(opened, [
      ['shop-frontend.html', '_blank', 'noopener'],
      ['shop-backend.html', '_blank', 'noopener'],
      ['shop-backend.html', '_blank', 'noopener'],
      ['shop-frontend.html', '_blank', 'noopener'],
    ]);
    // Back-link from the detail page returns to the overview.
    const loadedDetail = browser.cdp.waitFor('Page.loadEventFired', session);
    await send('Page.navigate', { url: pathToFileURL(frontend).href });
    await loadedDetail;
    const back = await evaluate(`(() => {
      const opened = [];
      window.open = (u, target) => { opened.push([u, target]); return null; };
      document.getElementById('node-pages').dispatchEvent(new MouseEvent('click', { bubbles: true }));
      return opened;
    })()`);
    assert.deepEqual(back, [['shop-overview.html', '_blank']]);
  } finally {
    await browser.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
