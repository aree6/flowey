// Post-delivery infinite hover-motion for Flowey viewer HTML.
//
// Problem: hover/focus trace animations play once — the traveling SMIL
// token (`<animateMotion dur="1.2s" fill="freeze">`) stops at the path end
// and the CSS trace overlays (`... 1 both`) hold their end state. When
// presenting, the motion is over before the explanation is.
//
// Fix, two parts:
// 1. CSS: force `animation-iteration-count: infinite` on the viewer's
//    hover-trace overlay classes (intent trace, relationship pulse/token,
//    semantic lens, route probe/journey). Ambient load animations and
//    story playback styling are untouched.
// 2. JS: patch every SMIL `animateMotion` to `repeatCount="indefinite"`.
//    Tokens are created/destroyed on hover, so a MutationObserver plus a
//    capture-phase mouseover hook keeps newly added tokens looping.
//
// Pacing: everything runs ~1.5x slower than the viewer default. CSS
// durations are read back computed and scaled (relative pacing between
// overlays is preserved); SMIL `dur` is scaled the same way. Each element
// is slowed once (marked `data-slowed`), and re-runs are idempotent.
//
// Deterministic: fixed template, no inputs, so output bytes are stable for
// a given input file. Runs AFTER `flowey deliver`. Idempotent guard:
// refuses to double-wrap (look for `data-flow-motion`).
import { createHash } from 'node:crypto';

export const FLOW_MOTION_MARKER = 'data-flow-motion';
export const BODY_CLOSE = '</body>';

const SNIPPET = '<style data-flow-motion="1">.intent-trace-flow,.relationship-flow-pulse,.relationship-flow-token,.semantic-lens-flow,.route-probe-flow,.route-journey-flow{animation-iteration-count:infinite !important}</style><script data-flow-motion="1">(function(){var F=1.5;function slow(el){try{var cs=getComputedStyle(el);var d=parseFloat(cs.animationDuration)||0;if(d>0){el.style.animationDuration=(d*F).toFixed(2)+\'s\';}}catch(e){}}function loop(){try{var sels=[\'.intent-trace-flow\',\'.relationship-flow-pulse\',\'.relationship-flow-token\',\'.semantic-lens-flow\',\'.route-probe-flow\',\'.route-journey-flow\'];for(var i=0;i<sels.length;i++){var els=document.querySelectorAll(sels[i]+\':not([data-slowed])\');for(var j=0;j<els.length;j++){els[j].setAttribute(\'data-slowed\',\'1\');slow(els[j]);}}var ms=document.querySelectorAll(\'animateMotion:not([repeatCount])\');for(var k=0;k<ms.length;k++){var m=ms[k];m.setAttribute(\'repeatCount\',\'indefinite\');try{var dd=parseFloat(m.getAttribute(\'dur\'))||0;if(dd>0){m.setAttribute(\'dur\',(dd*F).toFixed(2)+\'s\');}}catch(e){}}}catch(e){}}loop();try{new MutationObserver(loop).observe(document.documentElement,{childList:true,subtree:true});}catch(e){}document.addEventListener(\'mouseover\',loop,true);})();</script>';

export function hasFlowMotion(html) {
  return html.includes(FLOW_MOTION_MARKER);
}

export function applyFlowMotion(html) {
  if (hasFlowMotion(html)) {
    const error = new Error('Artifact already has the flow-motion layer; refusing to double-wrap.');
    error.code = 'motion/already-applied';
    throw error;
  }
  if (html.split(BODY_CLOSE).length - 1 !== 1) {
    const error = new Error('Expected exactly one </body> close tag.');
    error.code = 'motion/ambiguous-body';
    throw error;
  }
  return html.replace(BODY_CLOSE, `${SNIPPET}${BODY_CLOSE}`);
}

export function sha256Hex(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}
