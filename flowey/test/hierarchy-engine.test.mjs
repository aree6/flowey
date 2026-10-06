import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  TREE,
  buildForest,
  elbowPoints,
  forestGapCounts,
  layoutForest,
} from '../renderers/hierarchy/tree-layout.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const skillRoot = path.resolve(__dirname, '..');
const renderer = path.join(skillRoot, 'renderers/hierarchy/render-hierarchy.mjs');
const checker = path.join(skillRoot, 'scripts/check-render-output.mjs');

function workspace(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'flowey-hierarchy-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function render(input, output) {
  execFileSync(process.execPath, [renderer, input, output], { stdio: 'pipe' });
  return fs.readFileSync(output);
}

function writeDoc(directory, name, doc) {
  const input = path.join(directory, `${name}.json`);
  fs.writeFileSync(input, JSON.stringify(doc));
  return input;
}

function check(output) {
  return JSON.parse(execFileSync(process.execPath, [checker, output], { encoding: 'utf8' }));
}

function segmentLengths(points) {
  const lengths = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    lengths.push(
      Math.abs(points[index + 1][0] - points[index][0])
      + Math.abs(points[index + 1][1] - points[index][1]),
    );
  }
  return lengths;
}

test('hierarchy honors an authored node width down to the schema minimum', () => {
  const nodes = [
    { id: 'root', type: 'actor', label: 'Root' },
    { id: 'narrow', type: 'action', label: 'Narrow', width: 96 },
    { id: 'mid', type: 'action', label: 'Mid', width: 110 },
    { id: 'plain', type: 'action', label: 'Plain' },
    { id: 'tiny', type: 'action', label: 'Tiny', width: 40 },
  ];
  const links = ['narrow', 'mid', 'plain', 'tiny'].map((child) => ({ parent: 'root', child }));
  const layout = layoutForest(nodes, links);
  assert.equal(layout.boxes.get('narrow').width, 96);
  assert.equal(layout.boxes.get('mid').width, 110);
  // Below the schema minimum the authored value is ignored and the measured
  // default floor applies instead of silently squeezing text.
  assert.ok(layout.boxes.get('tiny').width >= TREE.minNodeW);
  assert.ok(layout.boxes.get('plain').width >= TREE.minNodeW);
});

test('hierarchy squeezes gaps toward floor minima before failing readability', (t) => {
  const directory = workspace(t);
  const labels = [0, 1, 2, 3, 4].map((index) => `Department of science ${index}${'x'.repeat(8)}`);
  const doc = {
    schema_version: 1,
    diagram_type: 'hierarchy',
    meta: { title: 'Marginal tree', quality_profile: 'showcase', output: 'marginal.html' },
    nodes: [
      { id: 'root', type: 'actor', label: 'Root' },
      ...labels.map((label, index) => ({ id: `c${index}`, type: 'action', label, role: `Role ${index}` })),
    ],
    links: labels.map((_, index) => ({ parent: 'root', child: `c${index}` })),
  };
  // Without relief this tree measures past the desktop readability budget.
  const unsqueezed = layoutForest(doc.nodes, doc.links);
  assert.ok(Math.ceil(unsqueezed.width) > 1240, `expected an over-budget tree, got ${unsqueezed.width}`);
  assert.deepEqual(unsqueezed.gaps, { gapX: TREE.gapX, forestGap: TREE.forestGap });

  const input = writeDoc(directory, 'marginal', doc);
  const first = render(input, path.join(directory, 'marginal-a.html'));
  const second = render(input, path.join(directory, 'marginal-b.html'));
  assert.deepEqual(second, first, 'same candidate renders byte-identical bytes');
  const receipt = check(path.join(directory, 'marginal-a.html'));
  assert.equal(receipt.ok, true);
  assert.deepEqual(receipt.composition.summary, { errors: 0, warnings: 0 });
  assert.ok(receipt.composition.metrics.minProjectedNodeTextPx >= 6);
  const viewBox = first.toString('utf8').match(/viewBox="0 0 (\d+) (\d+)"/);
  assert.ok(Number(viewBox[1]) < Math.ceil(unsqueezed.width), 'relief narrowed the canvas');
  assert.ok(Number(viewBox[1]) <= 1240, `relieved canvas fits the readability budget, got ${viewBox[1]}`);
});

test('hierarchy relief bottoms out at the documented floors on very wide trees', () => {
  const nodes = [{ id: 'root', type: 'actor', label: 'Root' }];
  const links = [];
  for (let index = 0; index < 16; index += 1) {
    nodes.push({ id: `c${index}`, type: 'action', label: `Department number ${index}`, role: `Role ${index}` });
    links.push({ parent: 'root', child: `c${index}` });
  }
  const { siblingSlots } = forestGapCounts(nodes, links);
  assert.equal(siblingSlots, 15);
  const floored = layoutForest(nodes, links, { gapX: TREE.floorGapX, forestGap: TREE.floorForestGap });
  assert.deepEqual(floored.gaps, { gapX: TREE.floorGapX, forestGap: TREE.floorForestGap });
  const plain = layoutForest(nodes, links);
  assert.equal(
    Math.ceil(plain.width) - Math.ceil(floored.width),
    siblingSlots * (TREE.gapX - TREE.floorGapX),
  );
});

test('hierarchy elbows never emit sub-floor bus slivers in any link order', (t) => {
  const nodes = [
    { id: 'p', type: 'actor', label: 'Parent' },
    { id: 'a', type: 'action', label: 'X'.repeat(19) },
    { id: 'b', type: 'action', label: 'Y' },
    { id: 'c', type: 'action', label: 'Z' },
  ];
  const orders = [
    ['a', 'b', 'c'], ['a', 'c', 'b'], ['b', 'a', 'c'],
    ['b', 'c', 'a'], ['c', 'a', 'b'], ['c', 'b', 'a'],
  ];
  for (const order of orders) {
    const links = order.map((child) => ({ parent: 'p', child }));
    const layout = layoutForest(nodes, links);
    for (const link of links) {
      for (const length of segmentLengths(elbowPoints(layout, link.parent, link.child))) {
        assert.ok(
          length <= 0.0001 || length >= 16,
          `order ${order.join('')}: edge ${link.child} has a ${length}px sub-floor segment`,
        );
      }
    }
  }

  // The same candidate renders byte-identical bytes across runs.
  const directory = workspace(t);
  const doc = {
    schema_version: 1,
    diagram_type: 'hierarchy',
    meta: { title: 'Sliver probe', quality_profile: 'showcase', output: 'sliver.html' },
    nodes,
    links: ['a', 'b', 'c'].map((child) => ({ parent: 'p', child })),
  };
  const input = writeDoc(directory, 'sliver', doc);
  const first = render(input, path.join(directory, 'sliver-a.html'));
  const second = render(input, path.join(directory, 'sliver-b.html'));
  assert.deepEqual(second, first);
  const receipt = check(path.join(directory, 'sliver-a.html'));
  assert.deepEqual(receipt.composition.summary, { errors: 0, warnings: 0 });
});

test('hierarchy org chart validates and renders byte-stable', (t) => {
  const directory = workspace(t);
  const input = path.join(skillRoot, 'examples/org-chart.hierarchy.json');
  const first = render(input, path.join(directory, 'org-a.html'));
  const second = render(input, path.join(directory, 'org-b.html'));
  assert.deepEqual(second, first, 'same candidate renders byte-identical bytes');
  const receipt = check(path.join(directory, 'org-a.html'));
  assert.equal(receipt.ok, true);
  assert.deepEqual(receipt.composition.summary, { errors: 0, warnings: 0 });
  // Geometry is byte-stable against the shipped example: only the page
  // template around the diagram may drift, never the measured tree.
  const shipped = fs.readFileSync(path.join(skillRoot, 'examples/hierarchy-org-chart.html'), 'utf8');
  const svgOf = (html) => html.match(/<svg[\s\S]*?<\/svg>/)[0];
  assert.equal(svgOf(first.toString('utf8')), svgOf(shipped));
});

test('forest gap counts cover sibling and forest slots', () => {
  const nodes = [
    { id: 'r1', type: 'actor', label: 'R1' },
    { id: 'r2', type: 'actor', label: 'R2' },
    { id: 'a', type: 'action', label: 'A' },
    { id: 'b', type: 'action', label: 'B' },
    { id: 'c', type: 'action', label: 'C' },
  ];
  const links = [
    { parent: 'r1', child: 'a' },
    { parent: 'r1', child: 'b' },
    { parent: 'r2', child: 'c' },
  ];
  assert.deepEqual(forestGapCounts(nodes, links), { siblingSlots: 1, forestSlots: 1 });
  assert.deepEqual(buildForest(nodes, links).roots, ['r1', 'r2']);
});
