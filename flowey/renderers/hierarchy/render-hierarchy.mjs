import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { esc, renderDefinitions, renderSemanticSigil } from '../shared/utils.mjs';
import { animateAttr, focusEdgeAttrs, focusNodeAttrs, focusNodeTitle, loadDiagramWithBrandMarks, writeDiagram, svgAccessibleText, svgRootAttrs } from '../shared/cli.mjs';
import { throwDiagnosticProblems } from '../shared/diagnostics.mjs';
import { legendFootprint, resolveLegend, renderLegend as renderResolvedLegend } from '../shared/legend.mjs';
import { fittedNodeFontSize, nodeLabelLayout } from '../shared/text-fit.mjs';
import { brandLabelFitWidth, brandMarkFor, brandMetadataFor, renderBrandMark } from '../shared/brand-marks.mjs';
import { translateMessage as i18nText } from '../shared/i18n.mjs';
import {
  asArray,
  roundedPath,
  routePointsValue,
  arrowClassMap,
  edgeLabelAccent,
  componentFill,
  componentText,
} from '../shared/geometry.mjs';
import { layoutForest, elbowPoints, TREE } from './tree-layout.mjs';
import { placeAutomaticLabels } from '../architecture/labels.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { diagram: hierarchy, template, outPath, sourceEvidence } = await loadDiagramWithBrandMarks({
  rendererDir: __dirname,
  diagramType: 'hierarchy',
  defaultExample: 'org-chart.hierarchy.json'
});

const nodes = asArray(hierarchy.nodes);
const links = asArray(hierarchy.links);
const byId = new Map(nodes.map((node) => [node.id, node]));
validateHierarchy();

// ---- Validation: tree contracts the schema cannot express ------------------
function validateHierarchy() {
  const problems = [];
  if (new Set(nodes.map((node) => node.id)).size !== nodes.length) {
    problems.push('Node ids must be unique.');
  }
  const parentOf = new Map();
  links.forEach((link, index) => {
    if (!byId.has(link.parent)) problems.push(`Link ${index} parent "${link.parent}" matches no node id.`);
    if (!byId.has(link.child)) problems.push(`Link ${index} child "${link.child}" matches no node id.`);
    if (link.parent === link.child) problems.push(`Link ${index} cannot parent "${link.child}" to itself.`);
    if (parentOf.has(link.child)) {
      problems.push(`Node "${link.child}" has two parents ("${parentOf.get(link.child)}" and "${link.parent}") — a hierarchy node reports to exactly one parent; use variant "dashed" on the primary line and describe the second line in a card.`);
    } else {
      parentOf.set(link.child, link.parent);
    }
  });
  // Acyclicity: walk up from every node; a repeat is a cycle.
  for (const node of nodes) {
    const seen = new Set([node.id]);
    let cursor = parentOf.get(node.id);
    while (cursor !== undefined) {
      if (seen.has(cursor)) {
        problems.push(`Reporting cycle detected through "${cursor}" — every chain must end at a root with no parent link.`);
        break;
      }
      seen.add(cursor);
      cursor = parentOf.get(cursor);
    }
  }
  if (problems.length) {
    throwDiagnosticProblems('Hierarchy validation failed', problems, {
      code: 'hierarchy/contract',
      subject: { diagramType: 'hierarchy' },
    });
  }
}

// Dotted-line (advisory) relationships keep the tree single-parented: the
// primary line is solid and the advisory nature is an edge variant + tag.
const LEGEND_CATALOG = [
  'actor',
  'action',
  'decision',
  'milestone',
  'place',
  'document',
  'record',
  'outcome',
  'group',
  'external',
].map((kind) => ({ kind, label: i18nText(hierarchy.meta.locale, `legend.hierarchy.${kind}`) }));

const layout = layoutForest(nodes, links);
const presentKinds = new Set(nodes.map((node) => node.type));
const legendEntries = resolveLegend(hierarchy.meta?.legend, LEGEND_CATALOG, presentKinds);
const legendWidth = Math.max(320, layout.width);
const legendExtra = legendFootprint(legendEntries, { width: legendWidth - 80 }).extraHeight;

let viewBox = [Math.ceil(layout.width), Math.ceil(layout.height + legendExtra + 56)];
if (Array.isArray(hierarchy.meta?.viewBox)) {
  const [authoredW, authoredH] = hierarchy.meta.viewBox;
  if (authoredW < viewBox[0] || authoredH < viewBox[1]) {
    throwDiagnosticProblems('Hierarchy canvas too small', [
      `meta.viewBox [${authoredW}, ${authoredH}] is smaller than the measured tree [${viewBox[0]}, ${viewBox[1]}] — remove viewBox to auto-size, or enlarge it past the measured tree.`,
    ], { code: 'hierarchy/viewport', subject: { diagramType: 'hierarchy' } });
  }
  viewBox = [authoredW, authoredH];
}

function legendY() {
  return viewBox[1] - 36;
}

// Trace step per node in layout order (roots first, then depth).
const nodeSteps = new Map();
{
  const ordered = [...nodes].sort((a, b) => {
    const da = layout.depths.get(a.id) ?? 0;
    const db = layout.depths.get(b.id) ?? 0;
    return da - db;
  });
  ordered.forEach((node, index) => nodeSteps.set(node.id, index % 12));
}

function nodeFontSizes(node, width) {
  return {
    label: fittedNodeFontSize(node.label, brandLabelFitWidth(node, width), 11, 9),
    role: fittedNodeFontSize(node.role || '', width, 8, 7),
    tag: fittedNodeFontSize(node.tag || '', width, 8, 7),
  };
}

function renderNode(node) {
  const box = layout.boxes.get(node.id);
  if (!box) return '';
  const fill = componentFill[node.type] || 'c-external';
  const accent = componentText[node.type] || 't-muted';
  const { label: labelFont, role: roleFont, tag: tagFont } = nodeFontSizes(node, box.width);
  const textRows = [{ text: node.label, font: labelFont, y: 23 }];
  if (node.role) textRows.push({ text: node.role, font: roleFont, y: 40 });
  if (node.tag) textRows.push({ text: node.tag, font: tagFont, y: box.height - 12 });
  const hasBrand = Boolean(brandMarkFor(node));
  const hasSource = Boolean(sourceEvidence?.nodes?.[node.id]?.length);
  const labelLayout = nodeLabelLayout({ width: box.width, height: box.height, rows: textRows,
    brand: hasBrand, source: hasSource, side: 'left', step: '' });
  const role = node.role
    ? `\n          <text data-detail="context" x="${box.cx}" y="${box.y + labelLayout.ys[1]}" class="t-muted" font-size="${roleFont}" text-anchor="middle">${esc(node.role)}</text>`
    : '';
  const tag = node.tag
    ? `\n        <text data-detail="fine" x="${box.cx}" y="${box.y + labelLayout.ys[node.role ? 2 : 1]}" class="${accent}" font-size="${tagFont}" text-anchor="middle">${esc(node.tag)}</text>`
    : '';
  const brand = renderBrandMark(node, { x: box.x + box.width - 22, y: box.y + 6 });
  const passport = {
    kind: node.type,
    sublabel: node.role,
    tag: node.tag,
    context: i18nText(hierarchy.meta.locale, 'node.context.hierarchy'),
    ...brandMetadataFor(node),
  };
  return `        <g ${focusNodeAttrs(node.id, node.label, passport, hierarchy.meta.locale)}>
          ${focusNodeTitle(node.label, passport)}
          <rect x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" rx="7" class="c-mask"/>
          <rect x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" rx="7" class="${fill}"${animateAttr(hierarchy.meta, 'node', nodeSteps.get(node.id))} stroke-width="1.5"/>
          ${renderSemanticSigil(node.type, { icon: node.icon, x: box.x + 6, y: box.y + labelLayout.sigilY, size: labelLayout.sigilSize })}${brand ? `\n          ${brand}` : ''}
          <text data-node-label=""${node.role ? ' data-detail-anchor=""' : ''} x="${box.x + labelLayout.x}" y="${box.y + labelLayout.ys[0]}" class="t-primary" font-size="${labelFont}" font-weight="600" text-anchor="middle">${esc(node.label)}</text>${role}${tag}
        </g>`;
}

function linkPoints(link) {
  return elbowPoints(layout, link.parent, link.child);
}

function linkLabelWidth(link) {
  return Math.max(32, (link.label || '').length * 4.9 + 12);
}

function linkLabelDefault(link) {
  const points = linkPoints(link);
  if (points.length < 2) return null;
  // Mid-bus for elbows, above-midpoint for straight single-child drops.
  const mid = points.length === 2
    ? [(points[0][0] + points[1][0]) / 2, points[0][1] - 10]
    : [(points[1][0] + points[2][0]) / 2, points[1][1] - 8];
  return mid;
}

function linkLabelRects() {
  const rects = [];
  links.forEach((link, relationIndex) => {
    if (!link.label) return;
    const mid = linkLabelDefault(link);
    if (!mid) return;
    const width = linkLabelWidth(link);
    rects.push({ relation: link, relationIndex, label: link.label,
      width, height: 16, lx: mid[0], ly: mid[1],
      x: mid[0] - width / 2, y: mid[1] - 11 });
  });
  return rects;
}

const resolvedLabelPoints = new Map();
// Showcase drafts leave label positions to the renderer too: move an unpinned
// label off other routes instead of reporting a clearance defect.
if (hierarchy.meta?.quality_profile === 'showcase') {
  const placed = placeAutomaticLabels({
    labels: linkLabelRects(),
    routes: links.map((link, relationIndex) => ({ relationIndex, points: linkPoints(link) })),
    components: [...layout.boxes.values()],
    titles: [],
    viewBox,
    placementBottom: layout.height,
  });
  for (const rect of placed) resolvedLabelPoints.set(rect.relation, [rect.lx, rect.ly]);
}

function linkLabelPoint(link) {
  return resolvedLabelPoints.get(link) || linkLabelDefault(link);
}

function renderLink(link, index) {
  const points = linkPoints(link);
  if (points.length < 2) return '';
  const variant = link.variant || 'default';
  const [cls, marker] = arrowClassMap[variant] || arrowClassMap.default;
  const strokeWidth = link.width || (variant === 'emphasis' ? 1.6 : 1.1);
  const d = roundedPath(points.map(([x, y]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10]), TREE.cornerR);
  return `        <path ${focusEdgeAttrs(link.parent, link.child, link.label, index, link.id)} data-composition-points="${routePointsValue(points)}" d="${d}" class="${cls}"${animateAttr(hierarchy.meta, 'edge', index)} stroke-width="${strokeWidth}" marker-end="url(#${marker})"/>`;
}

function renderLinkLabel(link, index) {
  if (!link.label) return '';
  const points = linkPoints(link);
  if (points.length < 2) return '';
  // Mid-bus for elbows, midpoint for straight single-child drops; showcase
  // placement may have relocated the label off other routes.
  const mid = linkLabelPoint(link);
  if (!mid) return '';
  const variant = link.variant || 'default';
  const width = linkLabelWidth(link);
  return `        <g data-detail="context" ${focusEdgeAttrs(link.parent, link.child, link.label, index, link.id)}>
          <rect x="${mid[0] - width / 2}" y="${mid[1] - 11}" width="${width}" height="16" rx="4" class="c-mask"/>
          <text x="${mid[0]}" y="${mid[1]}" class="${edgeLabelAccent(variant)}" font-size="8" text-anchor="middle">${esc(link.label)}</text>
        </g>`;
}

function renderSwatch(entry) {
  return `<rect x="${entry.x}" y="${entry.baseline - 8}" width="14" height="9" rx="2" class="${componentFill[entry.kind] || 'c-external'}" stroke-width="1"/>`;
}

function renderLegend() {
  return renderResolvedLegend({
    entries: legendEntries,
    locale: hierarchy.meta.locale,
    layout: {
      x: 40,
      baselineY: legendY(),
      width: viewBox[0] - 80,
      minTitleY: layout.height + 8,
      unfit: hierarchy.meta?.legend === undefined ? 'hide' : 'error',
      diagramType: 'hierarchy',
    },
    renderSwatch,
  });
}

function renderSvg() {
  const readerFit = hierarchy.meta?.viewBox ? '' : ' data-reader-fit="intrinsic-height"';
  return `      <svg viewBox="0 0 ${viewBox[0]} ${viewBox[1]}"${readerFit} ${svgRootAttrs(hierarchy.meta)}>
${svgAccessibleText(hierarchy.meta, 'hierarchy')}
${renderDefinitions()}

        <!-- Background Grid -->
        <rect width="100%" height="100%" fill="url(#grid)" />

        <!-- Reporting lines -->
${links.map(renderLink).join('\n')}

        <!-- People and units -->
${nodes.map(renderNode).join('\n\n')}

        <!-- Link labels -->
${links.map(renderLinkLabel).join('\n')}

        <!-- Legend -->
${renderLegend()}
      </svg>`;
}

writeDiagram({
  outPath,
  template,
  diagramType: 'hierarchy',
  meta: hierarchy.meta,
  svg: renderSvg(),
  cards: hierarchy.cards,
  sourceEvidence,
});
