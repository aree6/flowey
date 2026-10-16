// Layer toggle for a delivered Flowey artifact. Runs AFTER `flowey deliver`,
// like the motion and links stages. Idempotent: refuses to double-wrap.
//
// The artifact is a fixed-coordinate SVG, so "removing a layer" means hiding
// its nodes, its edges, and its boundary frames, then collapsing the vertical
// band it occupied so the remaining bands reflow instead of leaving a hole.
// Each layer declares the band it owns; hiding one removes that band and slides
// everything below it upward by the band's height. Nothing re-lays-out
// horizontally, so authored geometry is never disturbed.
//
// Deterministic: the same input bytes give the same output bytes.
import fs from 'node:fs';

export const FLOW_LAYERS_MARKER = 'data-flow-layers';
const BODY_CLOSE = '</body>';

function escapeAttr(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeScript(value) {
  return String(value).replace(/<\/script/gi, '<\\/script');
}

const PANEL_CSS = `
    .flow-layers{position:absolute;top:12px;right:14px;z-index:40;max-width:270px;
      background:var(--panel,rgba(255,255,255,.96));border:1px solid var(--border,#d7dce3);
      border-radius:9px;box-shadow:0 4px 16px rgba(0,0,0,.10);padding:9px 11px 10px;
      font:500 11px/1.35 ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:var(--text,#1b2430)}
    .flow-layers[hidden]{display:none}
    .flow-layers summary{cursor:pointer;list-style:none;display:flex;align-items:center;gap:6px;
      font-weight:700;font-size:11px;letter-spacing:.02em;text-transform:uppercase;opacity:.82}
    .flow-layers summary::-webkit-details-marker{display:none}
    .flow-layers summary::before{content:"\\25B8";font-size:9px;transition:transform .15s ease}
    .flow-layers[open] summary::before{transform:rotate(90deg)}
    .flow-layers ol{margin:8px 0 0;padding:0;list-style:none;display:grid;gap:5px}
    .flow-layers label{display:flex;align-items:flex-start;gap:7px;cursor:pointer;padding:1px 0}
    .flow-layers input[type=checkbox]{margin:1px 0 0;flex:none;accent-color:var(--accent,#2f6feb);cursor:pointer}
    .flow-layers .flow-layers-count{opacity:.6;font-weight:400;text-transform:none;letter-spacing:0}
    .flow-layers .flow-layers-all{margin-top:8px;padding-top:7px;border-top:1px solid var(--border,#d7dce3);
      font-weight:600;font-size:10px;cursor:pointer;color:var(--accent,#2f6feb)}
    html[data-flow-layers-collapsed="true"] .flow-layers{opacity:.72}
    @media print{.flow-layers{display:none!important}}`;

function panelHtml(layers) {
  const items = layers.map((layer, index) => `        <li><label><input type="checkbox" data-flow-layer="${escapeAttr(layer.id)}" checked>
          <span>${escapeScript(layer.label)} <span class="flow-layers-count">${escapeScript(layer.count)}</span></span></label></li>`).join('\n');
  return `<details class="flow-layers" data-flow-layers-panel>
      <summary>Layers <span class="flow-layers-count">${layers.length}</span></summary>
      <ol>
${items}
      </ol>
      <button type="button" class="flow-layers-all" data-flow-layers-all>Show all layers</button>
    </details>`;
}

// The runtime reads node/edge/frame geometry straight out of the delivered SVG
// rather than the source JSON, so a toggled artifact stays truthful about what
// it shows: band ownership is computed from each element's authored y range.
const RUNTIME_JS = (marker) => `(function () {
  var ROOT = document.documentElement;
  var PANEL = document.querySelector('[${marker}-panel]');
  if (!PANEL) return;
  var svg = document.querySelector('.diagram-container svg') || document.querySelector('svg[data-quality-profile]');
  if (!svg) return;

  function nodes() { return Array.prototype.slice.call(svg.querySelectorAll('[data-node-id]')); }
  function edges() { return Array.prototype.slice.call(svg.querySelectorAll('[data-edge-id]')); }
  function frames() { return Array.prototype.slice.call(svg.querySelectorAll('[data-composition-frame-id]')); }

  function nodeBox(el) {
    var rect = el.querySelector('rect');
    if (!rect) return null;
    return { top: Number(rect.getAttribute('y')), bottom: Number(rect.getAttribute('y')) + Number(rect.getAttribute('height')) };
  }

  var BANDS = ${'__BANDS__'};

  function bandOf(el, kind) {
    var box = kind === 'node' ? nodeBox(el) : null;
    var y0 = box ? box.top : Number((el.getAttribute('data-composition-points') || '0,0').split(';')[0].split(',')[1] || 0);
    for (var i = 0; i < BANDS.length; i += 1) {
      var band = BANDS[i];
      if (y0 >= band.a - 1 && y0 <= band.b + 1) return band.id;
    }
    return null;
  }

  // An edge belongs to the band of its own geometry, and a frame to the band
  // that contains most of its wrapped content. Hiding a layer therefore never
  // leaves a floating line or an orphaned boundary box.
  // The renderer emits each edge twice: a geometry <path> that carries
  // data-composition-points, and a <g> wrapper that holds the label. Both
  // share one data-edge-id, so ownership is computed once per id from whichever
  // element carries the points and then applied to every element with that id.
  function buildEdgeOwners() {
    var owners = {};
    edges().forEach(function (el) {
      var id = el.getAttribute('data-edge-id');
      if (!id || owners[id]) return;
      var points = (el.getAttribute('data-composition-points') || '').split(';').filter(Boolean);
      if (!points.length) return;
      var counts = {};
      for (var i = 0; i < points.length; i += 1) {
        var y = Number(points[i].split(',')[1]);
        if (!Number.isFinite(y)) continue;
        for (var j = 0; j < BANDS.length; j += 1) {
          var band = BANDS[j];
          if (y >= band.a - 1 && y <= band.b + 1) { counts[band.id] = (counts[band.id] || 0) + 1; break; }
        }
      }
      var best = null, bestCount = 0;
      for (var key in counts) if (counts[key] > bestCount) { best = key; bestCount = counts[key]; }
      if (best) owners[id] = best;
    });
    return owners;
  }

  var hidden = Object.create(null);
  var viewBox = svg.getAttribute('viewBox').split(/\\s+/).map(Number);
  var baseHeight = viewBox[3];

  function apply() {
    var drop = 0;
    var order = BANDS.map(function (band) { return band.id; });
    var shiftByBand = {};
    order.forEach(function (id) {
      var band = BANDS.filter(function (b) { return b.id === id; })[0];
      shiftByBand[id] = -drop;
      if (hidden[id]) drop += band.height;
    });
    // Total collapse is capped so a mostly-hidden view can never invert.
    var remaining = Math.max(0, baseHeight - drop);

    nodes().forEach(function (el) {
      var id = bandOf(el, 'node');
      var shift = id ? (shiftByBand[id] || 0) : 0;
      el.style.display = (id && hidden[id]) ? 'none' : '';
      el.style.setProperty('--flow-layer-shift', shift + 'px');
      el.querySelectorAll('rect, text, g').forEach(function (child) {
        if (child.hasAttribute('data-layer-shift')) return;
        child.setAttribute('data-layer-shift', '1');
        // A child with authored geometry (a sigil's nested scales) keeps its
        // own transform: the shift is prepended so it applies in the parent's
        // units, and the fill-box stamp is skipped — stamping it would resolve
        // the nested scales about the ink box and walk the mark off its
        // authored corner, while replacing the transform would drop the
        // authored placement entirely on collapse.
        var base = child.getAttribute('transform') || '';
        child.style.transform = shift ? 'translateY(' + shift + 'px)' + (base ? ' ' + base : '') : '';
        if (!base) child.style.transformBox = 'fill-box';
      });
    });

    var edgeOwners = buildEdgeOwners();
    edges().forEach(function (el) {
      var id = edgeOwners[el.getAttribute('data-edge-id')] || null;
      var shift = id ? (shiftByBand[id] || 0) : 0;
      el.style.display = (id && hidden[id]) ? 'none' : '';
      if (shift) el.style.transform = 'translateY(' + shift + 'px)';
      else el.style.transform = '';
    });

    frames().forEach(function (el) {
      var y = Number(el.getAttribute('y'));
      var h = Number(el.getAttribute('height'));
      var mid = y + h / 2;
      var id = null;
      for (var i = 0; i < BANDS.length; i += 1) {
        var band = BANDS[i];
        if (mid >= band.a - 1 && mid <= band.b + 1) { id = band.id; break; }
      }
      var shift = id ? (shiftByBand[id] || 0) : 0;
      el.style.display = (id && hidden[id]) ? 'none' : '';
      if (shift) el.style.transform = 'translateY(' + shift + 'px)';
      else el.style.transform = '';
    });

    svg.setAttribute('viewBox', '0 0 ' + viewBox[2] + ' ' + remaining);
    ROOT.setAttribute('data-flow-layers-active', order.filter(function (id) { return !hidden[id]; }).join(' '));
  }

  PANEL.addEventListener('change', function (event) {
    var input = event.target;
    if (!input || !input.hasAttribute || !input.hasAttribute('data-flow-layer')) return;
    hidden[input.getAttribute('data-flow-layer')] = !input.checked;
    apply();
  });

  var all = PANEL.querySelector('[data-flow-layers-all]');
  if (all) all.addEventListener('click', function () {
    hidden = Object.create(null);
    PANEL.querySelectorAll('[data-flow-layer]').forEach(function (input) { input.checked = true; });
    apply();
  });

  apply();
})();`;

function bandsFromLayers(layers) {
  return layers.map((layer) => ({
    id: layer.id,
    label: layer.label,
    a: layer.a,
    b: layer.b,
    height: layer.height,
    count: layer.count ?? '',
  }));
}

export function applyFlowLayers(html, layers) {
  if (!Array.isArray(layers) || layers.length === 0) {
    throw new Error('flow-layers requires a non-empty layers array');
  }
  if (html.includes(FLOW_LAYERS_MARKER)) return { html, applied: false, reason: 'already-applied' };
  for (const layer of layers) {
    for (const key of ['id', 'label', 'a', 'b', 'height']) {
      if (layer[key] === undefined || layer[key] === null) throw new Error(`layer ${layer.id || '?'} is missing ${key}`);
    }
    if (!(Number(layer.b) > Number(layer.a))) throw new Error(`layer ${layer.id} band is empty`);
  }
  const runtime = RUNTIME_JS(FLOW_LAYERS_MARKER).replace('__BANDS__', JSON.stringify(bandsFromLayers(layers)));
  const closeCount = html.split(BODY_CLOSE).length - 1;
  if (closeCount !== 1) throw new Error(`flow-layers requires exactly one body close tag, found ${closeCount}`);
  const body = BODY_CLOSE;
  const patched = html.replace(
    body,
    `  <style>${PANEL_CSS}\n  </style>\n  <div data-flow-layers-host>${panelHtml(layers)}</div>\n  <script>${runtime}</script>\n${body}`,
  );
  return { html: patched, applied: true };
}

export function runFlowLayers(inputPath, outputPath, layers) {
  const html = fs.readFileSync(inputPath, 'utf8');
  const result = applyFlowLayers(html, layers);
  if (result.applied) fs.writeFileSync(outputPath, result.html);
  return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [input, layersPath, output] = process.argv.slice(2);
  if (!input || !layersPath) {
    console.error('Usage: node bin/flow-layers.mjs <artifact.html> <layers.json> [output.html]');
    process.exit(2);
  }
  const layers = JSON.parse(fs.readFileSync(layersPath, 'utf8')).layers ?? JSON.parse(fs.readFileSync(layersPath, 'utf8'));
  const result = runFlowLayers(input, output || input, layers);
  console.log(result.applied ? `layer panel applied to ${output || input}` : `skipped: ${result.reason}`);
}