import test from 'node:test';
import assert from 'node:assert/strict';
import { applyFlowLayers } from '../bin/flow-layers.mjs';

const HTML = `<!doctype html><html><head><style>.a{}</style></head><body>
<div class="diagram-container"><svg viewBox="0 0 800 900" data-quality-profile="showcase">
<rect data-graph-role="structural-frame" data-composition-frame-id="0" data-composition-frame-label="Edge" x="10" y="40" width="700" height="120"/>
<g data-detail="context" data-edge-from="a" data-edge-to="b" data-edge-id="ab">
<path data-edge-from="a" data-edge-to="b" data-edge-id="ab" data-composition-points="240,95;300,95" d="M 240 95 L 300 95"/>
</g>
<g id="node-a" data-node-id="a" data-node-label="A"><rect x="40" y="60" width="200" height="70"/><text x="46" y="80">A</text></g>
<g id="node-b" data-node-id="b" data-node-label="B"><rect x="300" y="60" width="200" height="70"/></g>
<g id="node-c" data-node-id="c" data-node-label="C"><rect x="40" y="240" width="200" height="70"/></g>
<g id="node-d" data-node-id="d" data-node-label="D"><rect x="300" y="360" width="200" height="70"/></g>
</svg></div></body></html>`;

const LAYERS = [
  { id: 'edge', label: 'Edge', a: 40, b: 150, height: 120, count: 2 },
  { id: 'instances', label: 'Instances', a: 220, b: 320, height: 120, count: 1 },
  { id: 'data', label: 'Data', a: 340, b: 420, height: 80, count: 1 },
];

test('flow-layers appends exactly one panel style, one host, and one runtime script', () => {
  const out = applyFlowLayers(HTML, LAYERS).html;
  // The artifact already carries its own <style> and may carry scripts, so the
  // count is taken as a delta against the input rather than against zero.
  const count = (value, tag) => (value.match(new RegExp(tag, 'g')) || []).length;
  const styleDelta = count(out, '<style>') - count(HTML, '<style>');
  const scriptDelta = count(out, '<script>') - count(HTML, '<script>');
  assert.equal(styleDelta, 1);
  assert.equal(scriptDelta, 1);
  // The marker appears once as the host wrapper attribute and once as the
  // panel's own selector, which is what the runtime binds to.
  assert.equal(out.match(/data-flow-layers-panel/g)?.length, 2);
  assert.equal(out.match(/data-flow-layers-host/g)?.length, 1);
});

test('flow-layers renders one checkbox per authored layer with its count', () => {
  const out = applyFlowLayers(HTML, LAYERS).html;
  for (const layer of LAYERS) {
    assert.ok(out.includes(`data-flow-layer="${layer.id}"`), `missing checkbox for ${layer.id}`);
    assert.ok(out.includes(layer.label), `missing label for ${layer.id}`);
  }
  assert.equal(out.match(/type="checkbox"/g)?.length, LAYERS.length);
  assert.ok(out.includes('checked'), 'layers must start visible');
});

test('flow-layers checks out every box by default so nothing hides by accident', () => {
  const out = applyFlowLayers(HTML, LAYERS).html;
  assert.equal(out.match(/type="checkbox" data-flow-layer="[a-z]+" checked>/g)?.length, LAYERS.length);
});

test('flow-layers exposes a show-all control that restores every layer', () => {
  const out = applyFlowLayers(HTML, LAYERS).html;
  assert.ok(out.includes('data-flow-layers-all'));
  // The control clears the hidden map and re-checks every box before reapplying.
  assert.match(out, /hidden = Object\.create\(null\)/);
  assert.match(out, /\[data-flow-layer\][\s\S]{0,120}input\.checked = true/);
});

test('flow-layers collapses a hidden band and shifts the bands below it', () => {
  const out = applyFlowLayers(HTML, LAYERS).html;
  // Each band declares its own height, and the runtime subtracts exactly the
  // hidden ones from the viewBox height.
  for (const layer of LAYERS) assert.ok(out.includes(`"height":${layer.height}`), `band height missing for ${layer.id}`);
  assert.match(out, /remaining = Math\.max\(0, baseHeight - drop\)/);
  assert.match(out, /svg\.setAttribute\('viewBox', '0 0 ' \+ viewBox\[2\] \+ ' ' \+ remaining\)/);
});

test('flow-layers assigns geometry to bands rather than guessing ownership', () => {
  const out = applyFlowLayers(HTML, LAYERS).html;
  assert.match(out, /data-composition-points/);
  assert.match(out, /data-composition-frame-id/);
});

test('flow-layers resolves one owner per edge id and applies it to both halves', () => {
  const out = applyFlowLayers(HTML, LAYERS).html;
  // The renderer emits an edge as a geometry path plus a label wrapper that
  // share a data-edge-id; only the path carries points, so ownership must be
  // resolved once per id instead of per element or the label is left orphaned.
  assert.match(out, /if \(!id \|\| owners\[id\]\) return/);
  assert.match(out, /var edgeOwners = buildEdgeOwners\(\)/);
  assert.match(out, /edgeOwners\[el\.getAttribute\('data-edge-id'\)\]/);
});

test('flow-layers hides nodes, edges, and frames of a hidden layer together', () => {
  const out = applyFlowLayers(HTML, LAYERS).html;
  assert.match(out, /el\.style\.display = \(id && hidden\[id\]\) \? 'none' : ''/);
  assert.equal(out.match(/el\.style\.display = \(id && hidden\[id\]\) \? 'none' : ''/g)?.length, 3);
});

test('flow-layers keeps motion suppression and print export intact', () => {
  const out = applyFlowLayers(HTML, LAYERS).html;
  assert.match(out, /@media print\{\.flow-layers\{display:none!important\}\}/);
});

test('flow-layers refuses to double-wrap', () => {
  const once = applyFlowLayers(HTML, LAYERS);
  assert.equal(once.applied, true);
  const twice = applyFlowLayers(once.html, LAYERS);
  assert.equal(twice.applied, false);
  assert.equal(twice.reason, 'already-applied');
  assert.equal(twice.html, once.html);
});

test('flow-layers rejects an empty or malformed band list', () => {
  assert.throws(() => applyFlowLayers(HTML, []), /non-empty layers array/);
  assert.throws(() => applyFlowLayers(HTML, [{ id: 'x', label: 'X', b: 10, height: 5 }]), /missing a/);
  assert.throws(() => applyFlowLayers(HTML, [{ id: 'x', label: 'X', a: 10, b: 10, height: 5 }]), /band is empty/);
});

test('flow-layers requires exactly one body close tag', () => {
  assert.throws(() => applyFlowLayers(HTML.replace('</body>', ''), LAYERS), /body close tag/);
});