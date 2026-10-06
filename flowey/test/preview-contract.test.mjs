import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';

const here = path.dirname(fileURLToPath(import.meta.url));
const skillRoot = path.resolve(here, '..');
const repoRoot = path.resolve(skillRoot, '..');
const skill = fs.readFileSync(path.join(skillRoot, 'SKILL.md'), 'utf8');
const delivery = fs.readFileSync(path.join(skillRoot, 'references', 'delivery-contract.md'), 'utf8');
const readme = fs.readFileSync(path.join(repoRoot, 'README.md'), 'utf8');

test('preview contract: the skill keeps live preview explicit, desktop-only, and last-good', () => {
  assert.match(delivery, /flowey\.mjs preview <type> <input>\.json <output>\.html/);
  assert.match(delivery, /active desktop authoring loop/i);
  assert.match(delivery, /previous verified revision on screen and on disk/i);
  assert.match(delivery, /never start it by default/i);
  assert.match(delivery, /CI, unattended agents, remote sharing, or mobile use/i);
  assert.match(delivery, /must never enter the generated artifact or any export/i);
});

test('preview contract: the fork README documents live preview without changing the skill', () => {
  assert.match(readme, /# Flowey/);
  assert.match(readme, /bin\/flowey\.mjs preview/);
  assert.match(readme, /--no-open/);
  assert.match(readme, /127\.0\.0\.1|loopback/);
  assert.match(readme, /Ctrl-C/);
  assert.match(readme, /finalize/);
  assert.match(readme, /MIT/);
});

test('preview contract: the canonical delivery reference owns no-leak and zero-dependency boundaries', () => {
  assert.match(delivery, /Last-Good Live Preview/);
  assert.match(delivery, /zero-dependency Skill ZIP/i);
  assert.match(delivery, /Server state, port, source path, diagnostics, error text, and reload tokens must never enter/i);
});

test('skill references the preview command exactly once per contract surface', () => {
  for (const text of [skill, delivery]) {
    assert.ok(text.includes('preview'), 'preview must stay documented');
  }
});
