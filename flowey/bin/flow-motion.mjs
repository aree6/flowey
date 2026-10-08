// Post-delivery infinite motion for Flowey viewer HTML.
//
// Problem: trace animations play once — the traveling SMIL token
// (`<animateMotion dur="1.2s" fill="freeze">`) stops at the path end, the
// CSS trace overlays (`... 1 both`) hold their end state, and the ambient
// load animation (`flowey-edge-flow ... 1`) settles back to solid lines.
// When presenting, the motion is over before the explanation is.
//
// Fix, three parts:
// 1. CSS: force `animation-iteration-count: infinite` on the viewer's
//    hover-trace overlay classes (intent trace, relationship pulse/token,
//    semantic lens, route probe/journey).
// 2. CSS: loop the ambient edge flow with a seamless dash cycle
//    (`stroke-dashoffset 18 -> 0`, one dash period, so the loop has no
//    jump) instead of the one-shot sweep that settles to solid lines.
//    Node pulses keep their one-shot authoring. The loop is scoped to
//    live motion only: it never applies under `data-motion="still"`, a
//    motion owner, a hidden document, embed/share-playback proofs, or
//    `prefers-reduced-motion`.
// 3. Slide fit: when the artifact is opened with `?present=1` (the deck
//    iframe pattern), hide the viewer header — the slide already carries
//    the title — and reclaim its vertical budget for the canvas. The
//    toolbar, diagram nav, and export stay live.
// 4. JS: patch every SMIL `animateMotion` to `repeatCount="indefinite"`.
//    Tokens are created/destroyed on hover, so a MutationObserver plus a
//    capture-phase mouseover hook keeps newly added tokens looping.
// 5. JS: keep the "Notes & index" rail available in present mode. The
//    viewer only docks the rail outside embed/present/print, so without
//    this the reveal pill can never open notes from a slide. An attribute
//    observer re-pins the collapsed rail (never the opened dock), and only
//    when the panel actually has content.
//
// Pacing: hover overlays run ~1.5x slower than the viewer default. CSS
// durations are read back computed and scaled (relative pacing between
// overlays is preserved); SMIL `dur` is scaled the same way. Each element
// is slowed once (marked `data-slowed`), and re-runs are idempotent. The
// ambient loop keeps a calm near-authoring period instead of the slowdown.
//
// Deterministic: fixed template, no inputs, so output bytes are stable for
// a given input file. Runs AFTER `flowey deliver`. Idempotent guard:
// refuses to double-wrap (look for `data-flow-motion`).
import { createHash } from 'node:crypto';

export const FLOW_MOTION_MARKER = 'data-flow-motion';
export const BODY_CLOSE = '</body>';

const AMBIENT_CSS = '@keyframes flowey-ambient-loop{from{stroke-dashoffset:18;opacity:1}to{stroke-dashoffset:0;opacity:1}}'
  + 'html[data-motion-capable="true"]:not([data-motion="still"]):not([data-motion-owner]):not([data-document-hidden]):not([data-embed="true"]):not([data-share-playback="true"]) svg[data-animation="trace"] [data-animate="edge"],'
  + 'html[data-motion-capable="true"]:not([data-motion="still"]):not([data-motion-owner]):not([data-document-hidden]):not([data-embed="true"]):not([data-share-playback="true"]) svg[data-animation="trace"] [data-graph-role="automatic-crossover"]:has(> [data-animate="edge"]) > [data-graph-role="automatic-crossover-underlay"]'
  + '{stroke-dasharray:10 8 !important;animation:flowey-ambient-loop 1.2s linear infinite !important;animation-delay:calc(var(--step,0)*160ms) !important}'
  + '@media (prefers-reduced-motion:reduce){html svg[data-animation="trace"] [data-animate="edge"],'
  + 'html svg[data-animation="trace"] [data-graph-role="automatic-crossover"]:has(> [data-animate="edge"]) > [data-graph-role="automatic-crossover-underlay"]{animation:none !important}}';

// Slide fit for `?present=1` deck iframes: the slide carries the title, so
// the viewer header is hidden and its budget returns to the canvas. Notes
// stay reachable: the rail-open cards rule beats the present-mode hide.
const SLIDE_FIT_CSS = 'html[data-present="true"]:not([data-embed="true"]) body{padding:.5rem}'
  + 'html[data-present="true"]:not([data-embed="true"]) .container{gap:0;height:calc(100dvh - 1rem)}'
  + 'html[data-present="true"]:not([data-embed="true"]) .header{display:none !important}'
  + 'html[data-present="true"]:not([data-embed="true"]) .diagram-container{padding:.5rem;padding-bottom:calc(.5rem + var(--flowey-nav-reserve,0px))}'
  + 'html[data-present="true"]:not([data-embed="true"])[data-reader-rail="true"] .cards{display:flex !important}'
  + 'html[data-present="true"]:not([data-embed="true"]) .rail-reveal{top:3.75rem}';

const RAIL_JS = '(function(){function content(){try{var c=document.querySelector(".cards");var o=document.getElementById("node-outline");var f=document.querySelector(".focus-chip.relationship-lens");return Boolean((c&&c.children.length&&!c.hidden)||(o&&!o.hidden)||(f&&!f.hidden));}catch(e){return false;}}'
  + 'function pin(){try{var h=document.documentElement;if(h.getAttribute("data-present")!=="true"||h.getAttribute("data-embed")==="true")return;if(!content())return;var m=h.getAttribute("data-reader-rail");if(m!=="true"&&m!=="collapsed"){h.setAttribute("data-reader-rail","collapsed");h.style.setProperty("--flowey-rail-width","288px");h.style.setProperty("--flowey-rail-gap","20px");}var b=document.getElementById("rail-reveal");if(b&&m!=="true"){b.hidden=false;b.setAttribute("aria-expanded","false");}}catch(e){}}'
  + 'pin();try{new MutationObserver(function(muts){for(var i=0;i<muts.length;i++){if(muts[i].attributeName==="data-reader-rail"){pin();break;}}}).observe(document.documentElement,{attributes:true,attributeFilter:["data-reader-rail"]});}catch(e){}'
  + 'document.addEventListener("DOMContentLoaded",pin);})();';

const SNIPPET = '<style data-flow-motion="1">.intent-trace-flow,.relationship-flow-pulse,.relationship-flow-token,.semantic-lens-flow,.route-probe-flow,.route-journey-flow{animation-iteration-count:infinite !important}'
  + AMBIENT_CSS + SLIDE_FIT_CSS + '</style>'
  + '<script data-flow-motion="1">(function(){var F=1.5;function slow(el){try{var cs=getComputedStyle(el);var d=parseFloat(cs.animationDuration)||0;if(d>0){el.style.animationDuration=(d*F).toFixed(2)+\'s\';}}catch(e){}}function loop(){try{var sels=[\'.intent-trace-flow\',\'.relationship-flow-pulse\',\'.relationship-flow-token\',\'.semantic-lens-flow\',\'.route-probe-flow\',\'.route-journey-flow\'];for(var i=0;i<sels.length;i++){var els=document.querySelectorAll(sels[i]+\':not([data-slowed])\');for(var j=0;j<els.length;j++){els[j].setAttribute(\'data-slowed\',\'1\');slow(els[j]);}}var ms=document.querySelectorAll(\'animateMotion:not([repeatCount])\');for(var k=0;k<ms.length;k++){var m=ms[k];m.setAttribute(\'repeatCount\',\'indefinite\');try{var dd=parseFloat(m.getAttribute(\'dur\'))||0;if(dd>0){m.setAttribute(\'dur\',(dd*F).toFixed(2)+\'s\');}}catch(e){}}}catch(e){}}loop();try{new MutationObserver(loop).observe(document.documentElement,{childList:true,subtree:true});}catch(e){}document.addEventListener(\'mouseover\',loop,true);})();'
  + RAIL_JS + '</script>';

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
