import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const skillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.dirname(skillRoot);
const runner = path.join(repoRoot, 'scripts/run-browser-tests.mjs');

test('browser gate rejects an unavailable explicit browser instead of skipping', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'flowey-browser-gate-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  for (const chrome of ['', path.join(directory, 'missing-chrome')]) {
    const result = spawnSync(process.execPath, [runner], {
      encoding: 'utf8', env: { ...process.env, FLOWEY_CHROME: chrome },
    });
    assert.equal(result.status, 1, result.stdout || result.stderr);
    assert.match(result.stderr, /require an executable Chrome\/Chromium/);
    assert.doesNotMatch(result.stdout, /# SKIP/);
  }
});

// Observe the public runner's child invocation without starting real browsers
// in the ordinary Node matrix. The explicit browser gate supplies real coverage.
function interceptedRun(t, outcome) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'flowey-browser-gate-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const preload = path.join(directory, 'capture-runner.cjs');
  fs.writeFileSync(preload, `
const childProcess = require('node:child_process');
childProcess.spawnSync = (command, args, options) => {
  console.log(JSON.stringify({ command, args, cwd: options.cwd, chrome: options.env.FLOWEY_CHROME }));
  return ${JSON.stringify(outcome)};
};
require('node:module').syncBuiltinESMExports();
`);
  return spawnSync(process.execPath, ['--require', preload, runner], {
    cwd: directory,
    encoding: 'utf8',
    env: { ...process.env, FLOWEY_CHROME: process.execPath },
  });
}

test('browser gate includes dedicated and mixed browser suites and enables them', (t) => {
  const result = interceptedRun(t, { status: 0, signal: null });
  assert.equal(result.status, 0, result.stderr);
  const call = JSON.parse(result.stdout);
  assert.equal(call.command, process.execPath);
  assert.equal(fs.realpathSync(call.cwd), fs.realpathSync(skillRoot));
  assert.equal(call.chrome, process.execPath);
  assert.ok(call.args.includes('--test'));
  const files = call.args.filter((arg) => !arg.startsWith('--'));
  assert.equal(new Set(files).size, files.length);
  for (const file of files) assert.ok(fs.existsSync(path.join(skillRoot, file)), file);
  const required = [
    ...fs.readdirSync(path.join(skillRoot, 'test')).filter((file) => file.endsWith('-browser.test.mjs')),
    'sequence-header-clearance.test.mjs', 'i18n.test.mjs', 'semantic-radar.test.mjs', 'viewer-chrome-layout.test.mjs',
  ];
  for (const file of required) assert.ok(files.includes(path.join('test', file)), `${file} must run in the browser gate`);
});

for (const outcome of [{ status: 7, signal: null }, { status: null, signal: 'SIGTERM' }]) {
  test(`browser gate propagates child failure (${outcome.signal || outcome.status})`, (t) => {
    const result = interceptedRun(t, outcome);
    assert.equal(result.status, outcome.status ?? 1);
    if (outcome.signal) assert.match(result.stderr, /terminated by SIGTERM/);
  });
}

test('package browser command routes through the shared runner', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(skillRoot, 'package.json'), 'utf8'));
  assert.equal(manifest.scripts['test:browser'], 'node ../scripts/run-browser-tests.mjs');
});
