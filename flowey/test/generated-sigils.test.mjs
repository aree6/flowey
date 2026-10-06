import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { renderSemanticSigil } from '../renderers/shared/utils.mjs';
import { GENERATED_SIGILS } from '../renderers/shared/generated-sigils.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('generated sigils are fresh and cover the catalog', () => {
  const result = execFileSync(process.execPath,
    [path.join(root, 'scripts/generate-sigils.mjs'), '--check'], { encoding: 'utf8' });
  assert.match(result, /sigils fresh/);
  assert.ok(GENERATED_SIGILS.length >= 50);
  const names = GENERATED_SIGILS.map((g) => g.name);
  assert.deepEqual([...names].sort(), names);
  assert.equal(new Set(names).size, names.length);
});

test('every vendored glyph renders as a tone-colored corner stamp', () => {
  for (const glyph of GENERATED_SIGILS) {
    const html = renderSemanticSigil('action', { x: 6, y: 6, icon: glyph.name });
    assert.ok(html.includes(`data-semantic-sigil="${glyph.name}"`), glyph.name);
    assert.ok(html.includes('scale(0.0625)'), glyph.name);
    assert.ok(html.includes('sigil-fill'), glyph.name);
    assert.ok(!html.includes('<script'), glyph.name);
  }
});

test('unknown icons still fall back to neutral without breaking layout', () => {
  const html = renderSemanticSigil('action', { x: 6, y: 6, icon: 'not-a-real-icon' });
  assert.ok(html.includes('data-semantic-sigil="neutral"'));
  assert.equal(renderSemanticSigil('action', { x: 6, y: 6, icon: 'none' }), '');
});
