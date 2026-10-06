// Post-delivery click layer for Flowey viewer HTML.
//
// Wires rendered node groups (stable `#node-<id>` hooks) to open sibling
// detail pages in a new tab on click / Enter / Space. Deterministic: fixed
// template + sorted map keys, so output bytes are stable for a given input
// and link map. Runs AFTER `flowey deliver`, independently of the motion
// layer. Idempotent guard: refuses to double-wrap (look for
// `data-node-links`).
import { createHash } from 'node:crypto';

export const NODE_LINKS_MARKER = 'data-node-links';
export const BODY_CLOSE = '</body>';

const SNIPPET_TEMPLATE = '<style data-node-links-css="1">g[data-linked]{cursor:pointer}g[data-linked] rect[class^="c-"]{stroke-width:3 !important}g[data-linked]:hover rect[class^="c-"],g[data-linked]:focus-visible rect[class^="c-"]{stroke-width:4 !important}</style><script data-node-links="1">(function(){var M=%s;function openUrl(u){window.open(u,"_blank","noopener")}Object.keys(M).forEach(function(id){var g=document.getElementById("node-"+id);if(!g||g.hasAttribute("data-linked"))return;g.setAttribute("data-linked","1");g.style.cursor="pointer";g.addEventListener("click",function(){openUrl(M[id])});g.addEventListener("keydown",function(e){if(e.key==="Enter"||e.key===" "){e.preventDefault();openUrl(M[id])}})});})();</script>';

export function hasNodeLinks(html) {
  return html.includes(NODE_LINKS_MARKER);
}

function missingNodeIds(html, linkMap) {
  return Object.keys(linkMap).filter((id) => !html.includes(`id="node-${id}"`));
}

export function applyNodeLinks(html, linkMap) {
  if (hasNodeLinks(html)) {
    const error = new Error('Artifact already has the node-links layer; refusing to double-wrap.');
    error.code = 'links/already-applied';
    throw error;
  }
  const missing = missingNodeIds(html, linkMap || {});
  if (missing.length) {
    const error = new Error(`Node ids not found in artifact: ${missing.join(', ')}.`);
    error.code = 'links/unknown-node';
    error.missing = missing;
    throw error;
  }
  if (html.split(BODY_CLOSE).length - 1 !== 1) {
    const error = new Error('Expected exactly one </body> close tag.');
    error.code = 'links/ambiguous-body';
    throw error;
  }
  const sorted = {};
  for (const key of Object.keys(linkMap || {}).sort()) sorted[key] = linkMap[key];
  const snippet = SNIPPET_TEMPLATE.replace('%s', JSON.stringify(sorted));
  return html.replace(BODY_CLOSE, `${snippet}${BODY_CLOSE}`);
}

export function sha256Hex(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}
