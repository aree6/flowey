import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { emitIcon, searchIcons } from '../bin/flow-icons.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('flow-icons searches vendored glyphs by name and tag', () => {
  const byName = searchIcons('database');
  assert.ok(byName.some((m) => m.name === 'database'));
  const byTag = searchIcons('fee');
  assert.ok(byTag.some((m) => m.name === 'bank'));
  const multi = searchIcons('pay fee');
  assert.deepEqual(multi.map((m) => m.name), ['bank']);
  assert.deepEqual(searchIcons('no-such-glyph-xyz').length, 0);
  // Empty query lists the whole vendored set, sorted.
  const all = searchIcons('');
  assert.ok(all.length >= 50);
  assert.deepEqual([...all.map((m) => m.name)].sort(), all.map((m) => m.name));
});

test('flow-icons catalog matches vendored files one-to-one', () => {
  const catalog = JSON.parse(fs.readFileSync(path.join(root, 'icons/catalog.json'), 'utf8'));
  const files = fs.readdirSync(path.join(root, 'icons/phosphor')).filter((f) => f.endsWith('.svg'));
  assert.deepEqual(files.map((f) => f.replace(/\.svg$/, '')).sort(), Object.keys(catalog.glyphs).sort());
});

test('flow-icons emit returns inert scaled stamp markup', () => {
  const markup = emitIcon('database');
  assert.match(markup, /<g class="sigil-fill" transform="scale\(0\.0625\)">/);
  assert.match(markup, /<path /);
  assert.doesNotMatch(markup, /<script|on\w+=|javascript:/i);
  assert.throws(() => emitIcon('no-such-glyph'), /Unknown icon/);
});

test('flowey icons CLI searches and emits', () => {
  const bin = path.join(root, 'bin/flowey.mjs');
  const out = execFileSync(process.execPath, [bin, 'icons', 'database'], { encoding: 'utf8' });
  assert.match(out, /database/);
  const none = execFileSync(process.execPath, [bin, 'icons', 'no-such-glyph-xyz'], { encoding: 'utf8' });
  assert.match(none, /No vendored icon matched/);
  const json = JSON.parse(execFileSync(process.execPath, [bin, 'icons', 'shop', '--json', '--limit', '2'], { encoding: 'utf8' }));
  assert.equal(json.command, 'icons');
  assert.ok(json.matches.length <= 2);
  assert.ok(json.matches.every((m) => m.icon && m.tone && m.tags));
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'flowey-icons-cli-'));
  try {
    assert.throws(() => execFileSync(process.execPath, [bin, 'icons', '--bogus'], { encoding: 'utf8' }));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
