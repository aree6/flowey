import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { ChromeVisualBrowser, findChrome } from '../bin/visual-check.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Corner stamps and node titles must never intersect, whatever the label.
// This measures real rendered glyph boxes in Chrome (not the width
// estimator), across adversarial titles, both icon sides, and built-in plus
// vendored glyphs — so the overlap class cannot regress silently.
const TITLES = [
  'Restaurant Partner',
  'Dispatch Service HQ',
  'Customer App Premium',
  'Orders DB Primary',
  'Payments Gateway Ext',
];

test('node titles never touch their corner icon in a real browser', async (t) => {
  if (!Object.hasOwn(process.env, 'FLOWEY_CHROME')) return t.skip('Set FLOWEY_CHROME for real browser checks');
  const chrome = findChrome();
  assert.ok(chrome);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'flowey-sigil-clearance-'));
  try {
    const components = TITLES.map((label, index) => ({
      id: `n${index}`,
      type: ['actor', 'action', 'document', 'decision', 'record'][index % 5],
      label,
      pos: [40 + (index % 3) * 230, 80 + Math.floor(index / 3) * 180],
      size: [170, 72],
      icon: ['storefront', 'terminal', 'database', 'calendar', 'truck'][index % 5],
    }));
    const candidate = {
      schema_version: 1,
      diagram_type: 'architecture',
      meta: { title: 'Clearance probe', output: 'probe.html' },
      components,
      boundaries: [],
      connections: [],
    };
    const input = path.join(dir, 'input.json');
    const output = path.join(dir, 'probe.html');
    fs.writeFileSync(input, JSON.stringify(candidate));
    execFileSync(process.execPath, [path.join(root, 'bin/flowey.mjs'), 'render', 'architecture', input, output]);
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
      await send('Page.navigate', { url: pathToFileURL(output).href });
      await loaded;
      const overlaps = await evaluate(`(async () => {
        await document.fonts.ready;
        await Flowey.layoutStability.whenStable();
        const svg = document.querySelector('.diagram-container > svg');
        const scale = svg.getBoundingClientRect().width / svg.viewBox.baseVal.width;
        const hits = [];
        document.querySelectorAll('[data-node-id]').forEach((node) => {
          const sigil = node.querySelector('[data-semantic-sigil]');
          if (!sigil) return;
          const s = sigil.getBoundingClientRect();
          node.querySelectorAll('text[data-node-label], text').forEach((text) => {
            const b = text.getBoundingClientRect();
            if (b.width === 0 || b.height === 0) return;
            const sharesBand = b.top < s.bottom && b.bottom > s.top;
            if (!sharesBand) return;
            // Clearance in SVG units: a title row sharing the icon's band
            // must start well clear of the stamp, not 2 units from its edge.
            const clearance = (b.left - s.right) / scale;
            if (clearance < 6) hits.push({ node: node.id, text: text.textContent, clearanceUnits: Math.round(clearance * 10) / 10 });
          });
        });
        return hits;
      })()`);
      assert.deepEqual(overlaps, [], 'label text crowds the corner icon');
    } finally {
      await browser.close();
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
