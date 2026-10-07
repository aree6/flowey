import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function spec(components, boundaries) {
  return {
    schema_version: 1,
    diagram_type: 'architecture',
    meta: { title: 'Membership probe', output: 'probe.html' },
    components,
    boundaries,
    connections: [],
  };
}

function box(id, x, y, w = 130, h = 60) {
  return { id, type: 'action', label: id, pos: [x, y], size: [w, h] };
}

function validateJson(candidate) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'flowey-membership-'));
  try {
    const input = path.join(dir, 'input.json');
    fs.writeFileSync(input, JSON.stringify(candidate));
    try {
      execFileSync(process.execPath, [path.join(root, 'bin/flowey.mjs'), 'validate', 'architecture', input, '--json'], { encoding: 'utf8' });
      return null;
    } catch (error) {
      return JSON.parse(error.stdout);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// A non-member drawn fully inside a boundary frame reads as a member even
// though wraps says otherwise: the gate must fail, naming the fix.
test('a non-member inside a boundary frame fails with layout/boundary-membership', () => {
  const receipt = validateJson(spec(
    [box('inside_a', 100, 200), box('inside_b', 400, 200), box('intruder', 240, 205)],
    [{ kind: 'scope', label: 'Team', wraps: ['inside_a', 'inside_b'] }],
  ));
  assert.ok(receipt, 'expected validation to fail');
  const membership = (receipt.diagnostics || []).filter((d) => d.code === 'layout/boundary-membership');
  assert.equal(membership.length, 1);
  assert.match(membership[0].message, /Component "intruder" sits inside boundary "Team"/);
  assert.deepEqual(membership[0].supportedFixes, [
    'move component "intruder" outside the "Team" frame',
    'add "intruder" to the wraps of boundary "Team"',
  ]);
});

// Members of a boundary nested inside the frame are exempt: nesting geometry
// is already checked for membership agreement elsewhere.
test('members of a nested boundary inside the frame are exempt', () => {
  const receipt = validateJson(spec(
    [box('outer_a', 100, 200), box('inner_a', 300, 200), box('inner_b', 300, 320)],
    [
      { kind: 'region', label: 'Outer', wraps: ['outer_a', 'inner_a', 'inner_b'] },
      { kind: 'scope', label: 'Inner', wraps: ['inner_a', 'inner_b'] },
    ],
  ));
  const membership = (receipt?.diagnostics || []).filter((d) => d.code === 'layout/boundary-membership');
  assert.deepEqual(membership, []);
});

// A component merely touching the frame edge is not fully inside.
test('a component outside the frame passes the membership check', () => {
  const receipt = validateJson(spec(
    [box('inside_a', 100, 200), box('inside_b', 300, 200), box('far', 700, 500)],
    [{ kind: 'scope', label: 'Team', wraps: ['inside_a', 'inside_b'] }],
  ));
  const membership = (receipt?.diagnostics || []).filter((d) => d.code === 'layout/boundary-membership');
  assert.deepEqual(membership, []);
});
