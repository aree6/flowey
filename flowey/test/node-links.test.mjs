import test from 'node:test';
import assert from 'node:assert/strict';

import { applyNodeLinks, hasNodeLinks } from '../bin/node-links.mjs';

const HTML = '<!doctype html><html><head></head><body><g id="node-dean"></g><g id="node-registrar"></g></body></html>';
const MAP = { registrar: 'registrar.html', dean: 'dean.html' };

test('node-links wires every mapped node id exactly once', () => {
  const out = applyNodeLinks(HTML, MAP);
  assert.ok(hasNodeLinks(out));
  assert.match(out, /data-node-links-css/);
  assert.match(out, /data-node-links="1"/);
  // Deterministic: key order is sorted regardless of map insertion order.
  const flipped = applyNodeLinks(HTML, { dean: 'dean.html', registrar: 'registrar.html' });
  assert.equal(flipped, out);
});

test('node-links opens targets in a new tab with keyboard support', () => {
  const out = applyNodeLinks(HTML, MAP);
  assert.match(out, /window\.open\(u,"_blank","noopener"\)/);
  assert.match(out, /Enter/);
});

test('node-links refuses to double-wrap', () => {
  const once = applyNodeLinks(HTML, MAP);
  assert.throws(() => applyNodeLinks(once, MAP), /already has the node-links layer/);
});

test('node-links rejects unknown node ids', () => {
  assert.throws(() => applyNodeLinks(HTML, { ghost: 'ghost.html' }), /Node ids not found in artifact: ghost/);
});

test('node-links requires exactly one body close tag', () => {
  const noBody = '<g id="node-dean"></g><g id="node-registrar"></g>';
  assert.throws(() => applyNodeLinks(noBody, MAP), /exactly one/);
});
