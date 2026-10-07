import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// The shipped food deck is the drill-down pattern made concrete: the link
// manifest must agree with the sources, so agents copying it inherit working
// wiring instead of dead node ids or dangling targets.
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'examples/food-deck.links.json'), 'utf8'));

function nodeIds(spec) {
  const collection = spec.components || spec.nodes || spec.states || spec.participants || [];
  return new Set(collection.map((node) => node.id));
}

test('deck manifest pages match shipped sources and outputs', () => {
  const outputs = new Map();
  for (const [file, page] of Object.entries(manifest.pages)) {
    const source = path.join(root, 'examples', file);
    assert.ok(fs.existsSync(source), `${file} must be shipped`);
    const spec = JSON.parse(fs.readFileSync(source, 'utf8'));
    assert.equal(spec.meta.output, page.output, `${file} meta.output must equal the manifest output`);
    assert.ok(page.output.endsWith('.html'));
    assert.ok(Object.keys(page.links).length > 0, `${file} must wire at least one node`);
    outputs.set(page.output, file);
    const ids = nodeIds(spec);
    for (const [nodeId, target] of Object.entries(page.links)) {
      assert.ok(ids.has(nodeId), `${file} links unknown node "${nodeId}"`);
      assert.ok(target.endsWith('.html'), `${file} link target "${target}" must be a sibling page`);
    }
  }
  for (const [file, page] of Object.entries(manifest.pages)) {
    for (const target of Object.values(page.links)) {
      assert.ok(outputs.has(target), `${file} links to "${target}", which is not a deck page`);
    }
  }
});

test('overview is simple and every detail links home', () => {
  const overview = JSON.parse(fs.readFileSync(path.join(root, 'examples/food-overview.architecture.json'), 'utf8'));
  assert.ok(overview.components.length <= 7, 'the simple overview stays at most 7 nodes');
  assert.ok(overview.components.some((c) => c.id === 'full-map'), 'the overview carries the unified-view nav node');
  for (const file of ['food-order-detail.architecture.json', 'food-dispatch-detail.architecture.json']) {
    const targets = Object.values(manifest.pages[file].links);
    assert.ok(targets.length > 0 && targets.every((t) => t === 'food-overview.html'), `${file} links every node back to the overview`);
  }
  const unified = manifest.pages['food-unified.architecture.json'];
  assert.ok(Object.keys(unified.links).length >= 8, 'the unified view wires its nodes sideways into details');
});
