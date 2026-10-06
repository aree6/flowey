import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const skillRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(skillRoot, '..');

test('agent onboarding points at the skill file and the doctor command', () => {
  const readme = fs.readFileSync(path.join(repoRoot, 'README.md'), 'utf8');
  assert.match(readme, /flowey\/SKILL\.md/);
  assert.match(readme, /bin\/flowey\.mjs doctor/);
  for (const agent of ['Cursor', 'Codex', 'Claude', 'OpenCode']) {
    assert.ok(readme.includes(agent), `README must name ${agent}`);
  }
  const skill = fs.readFileSync(path.join(skillRoot, 'SKILL.md'), 'utf8');
  assert.match(skill, /name: flowey/);
  assert.match(skill, /node bin\/flowey\.mjs doctor/);
});
