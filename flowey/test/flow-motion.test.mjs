import test from 'node:test';
import assert from 'node:assert/strict';

import { applyFlowMotion, hasFlowMotion } from '../bin/flow-motion.mjs';

const HTML = '<!doctype html><html><head></head><body><svg></svg></body></html>';

test('flow-motion appends one style and one script layer', () => {
  const out = applyFlowMotion(HTML);
  assert.equal(out.split('data-flow-motion').length - 1, 2);
  assert.ok(out.endsWith('</script></body></html>'));
  // Deterministic: same input bytes give same output bytes.
  assert.equal(applyFlowMotion(HTML), out);
});

test('flow-motion forces infinite iteration and indefinite SMIL repeat', () => {
  const out = applyFlowMotion(HTML);
  assert.match(out, /animation-iteration-count:infinite/);
  assert.match(out, /repeatCount.*indefinite/);
  assert.match(out, /MutationObserver/);
  assert.match(out, /mouseover.*true/);
});

test('flow-motion refuses to double-wrap', () => {
  const once = applyFlowMotion(HTML);
  assert.ok(hasFlowMotion(once));
  assert.throws(() => applyFlowMotion(once), /already has the flow-motion layer/);
});

test('flow-motion requires exactly one body close tag', () => {
  assert.throws(() => applyFlowMotion('<html></html>'), /exactly one/);
  assert.throws(() => applyFlowMotion('<body></body></body>'), /exactly one/);
});
