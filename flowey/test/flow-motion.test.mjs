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

test('flow-motion loops the ambient edge flow with a seamless dash cycle', () => {
  const out = applyFlowMotion(HTML);
  assert.match(out, /@keyframes flowey-ambient-loop/);
  // One dash period (10 8): offset 18 -> 0 loops without a jump.
  assert.match(out, /stroke-dashoffset:18/);
  assert.match(out, /stroke-dasharray:10 8 !important/);
  assert.match(out, /flowey-ambient-loop 1\.2s linear infinite/);
  // Scoped to live motion only: still, owners, hidden docs, embed and
  // share-playback proofs, and reduced-motion users are excluded.
  for (const guard of [
    '[data-motion="still"]',
    '[data-motion-owner]',
    '[data-document-hidden]',
    '[data-embed="true"]',
    '[data-share-playback="true"]',
    'prefers-reduced-motion',
  ]) {
    assert.ok(out.includes(guard), `missing guard ${guard}`);
  }
});

test('flow-motion fits present mode for slide iframes and keeps notes', () => {
  const out = applyFlowMotion(HTML);
  // Slide carries the title: viewer header hidden, budget to the canvas.
  assert.match(out, /\[data-present="true"[^\{]*\.header\{display:none !important\}/);
  // Rail-open notes beat the present-mode cards hide.
  assert.match(out, /\[data-reader-rail="true"\] \.cards\{display:flex !important\}/);
  // Reveal pill kept available in present mode (collapsed only, never the
  // opened dock; only when the panel has content).
  assert.match(out, /rail-reveal/);
  assert.match(out, /data-reader-rail","collapsed"/);
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
