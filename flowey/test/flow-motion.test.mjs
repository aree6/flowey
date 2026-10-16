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

test('flow-motion gives present mode the whole canvas', () => {
  const out = applyFlowMotion(HTML);
  // Slide carries the title: viewer header hidden, budget to the canvas.
  assert.match(out, /\[data-present="true"[^\{]*\.header\{display:none !important\}/);
  assert.match(out, /\[data-present="true"[^\{]*\.container\{gap:0;height:100dvh;padding:0\}/);
  // Every other viewer affordance goes too: a slide wants the drawing only.
  for (const chrome of ['.toolbar', '.diagram-nav', '.rail-reveal', '.reader-rail', '.cards', '[data-legend]']) {
    assert.ok(
      out.includes(chrome),
      `present mode should hide ${chrome} so the drawing fills the slide`,
    );
  }
  assert.match(out, /\[data-legend\]\{display:none !important\}/);
  // The nav reserve that padded the canvas for the bottom bar goes with it.
  assert.match(out, /\.diagram-container\{--flowey-nav-reserve:0px\}/);
  // Still scoped: embed is untouched by all of the above.
  for (const rule of out.match(/html\[data-present="true"\][^}]+\}/g) || []) {
    assert.ok(rule.includes(':not([data-embed="true"])'), `unscoped present rule: ${rule}`);
  }
});

test('flow-motion only pins the rail for visible content', () => {
  const out = applyFlowMotion(HTML);
  // Present mode hides .cards with display:none while the hidden attribute
  // stays false, so a bare `!c.hidden` check sees content where none is
  // visible and reserves a 288px rail over a chromeless slide. Content means
  // visible content: computed display and visibility decide, not the attribute.
  assert.match(out, /function vis\(el\)\{[^}]*getComputedStyle\(el\)\.display!=="none"/);
  assert.match(out, /function vis\(el\)\{[^}]*getComputedStyle\(el\)\.visibility!=="hidden"/);
  assert.ok(!out.includes('c.children.length&&!c.hidden)'), 'stale hidden-attribute check still present');
});

test('flow-motion clamps the canvas to the present viewport', () => {
  const out = applyFlowMotion(HTML);
  // The viewer width-fitting loop can force a pixel width wider than the
  // embedding frame, which shifts the drawing and misaligns hover hit areas.
  // Stylesheet !important beats the inline custom properties the loop sets, so
  // the rail reserve and the diagram cap stay at zero/full in present mode.
  assert.match(out, /--flowey-rail-width:0px !important/);
  assert.match(out, /--flowey-rail-gap:0px !important/);
  assert.match(out, /--flowey-diagram-max-width:100% !important/);
  assert.match(out, /\.diagram-container\{width:100% !important;min-width:0 !important;max-width:100% !important\}/);
  assert.match(out, /\.diagram-container svg\{max-width:100% !important;\}/);
  // A pixel height forced by the width-fitting loop overflows short frames
  // and clips the drawing's foot, so both axes are capped and the meet fit
  // letterboxes instead of spilling.
  assert.match(out, /\.diagram-container\{height:100% !important;min-height:0 !important;max-height:100% !important;overflow:hidden !important\}/);
  assert.match(out, /\.diagram-container svg\{width:100% !important;height:100% !important;\}/);
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
