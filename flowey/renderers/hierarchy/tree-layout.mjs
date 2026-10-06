// Top-down tree layout for hierarchy diagrams (org charts, reporting lines).
//
// The tree is fully derived: authors describe nodes and parent/child links,
// never coordinates. Each depth level forms one row; every subtree is laid
// out left to right, and each parent centers over the span of its children.
// Connectors are elbows: parent bottom-center down a short stub, one
// horizontal bus per parent, then straight down into each child top-center.
// A single child connects with a straight vertical line.
//
// All dimensions derive from measured label text so CJK and long titles fit
// without authoring geometry. Minimum segment lengths respect the route
// rhythm budgets enforced by check-render-output (no micro segments).
import { textUnits } from '../shared/utils.mjs';

export const TREE = {
  minNodeW: 120,
  maxNodeW: 230,
  // An authored node width is honored down to the schema minimum (96). The
  // measured default floor above stays at 120 so unmeasured labels keep their
  // readable default; only an explicit author choice narrows a node.
  authoredMinNodeW: 96,
  nodeHPad: 28,
  labelFont: 11,
  roleFont: 8,
  tagFont: 8,
  lineH: 13,
  topPad: 18,
  bottomPad: 16,
  marginX: 56,
  topMargin: 64,
  gapX: 48,
  forestGap: 96,
  // Documented floor minima for desktop-readability budget relief. When the
  // measured tree exceeds the desktop readability width, sibling and forest
  // gaps squeeze toward these floors (same proportional pattern the lifecycle
  // renderer uses squeezing column gaps toward its floorGap) before the
  // canvas is reported over budget. Floors keep at least one 16px
  // interior-segment rhythm unit plus separation between neighbouring
  // subtrees; relief never moves or narrows a node box.
  floorGapX: 24,
  floorForestGap: 48,
  rowPitch: 128,
  stubLen: 24,
  cornerR: 8,
};

// Advance width of one text unit at the node label size, plus padding.
function measureNodeWidth(node) {
  if (Number.isFinite(node.width) && node.width >= TREE.authoredMinNodeW) {
    return Math.min(node.width, TREE.maxNodeW + 60);
  }
  const longest = Math.max(
    textUnits(node.label || ''),
    textUnits(node.role || '') * 0.82,
    textUnits(node.tag || '') * 0.82,
  );
  return Math.min(
    TREE.maxNodeW,
    Math.max(TREE.minNodeW, Math.ceil(longest * 5.6 + TREE.nodeHPad)),
  );
}

function nodeLineCount(node) {
  let lines = 1;
  if (node.role) lines += 1;
  if (node.tag) lines += 1;
  return lines;
}

function measureNodeHeight(node) {
  return TREE.topPad + nodeLineCount(node) * TREE.lineH + TREE.bottomPad;
}

// Build parent/children adjacency. Validation (unique ids, known endpoints,
// single parent, acyclicity) lives in the renderer; layout assumes a forest.
export function buildForest(nodes, links) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const children = new Map(nodes.map((node) => [node.id, []]));
  const parentOf = new Map();
  for (const link of links) {
    if (!byId.has(link.parent) || !byId.has(link.child)) continue;
    if (link.parent === link.child) continue;
    if (parentOf.has(link.child)) continue;
    parentOf.set(link.child, link.parent);
    children.get(link.parent).push(link.child);
  }
  const roots = nodes.filter((node) => !parentOf.has(node.id)).map((node) => node.id);
  return { byId, children, parentOf, roots: roots.length ? roots : nodes.slice(0, 1).map((n) => n.id) };
}

export function layoutForest(nodes, links, gaps = {}) {
  const gapX = Number.isFinite(gaps.gapX) ? gaps.gapX : TREE.gapX;
  const forestGap = Number.isFinite(gaps.forestGap) ? gaps.forestGap : TREE.forestGap;
  const { byId, children, parentOf, roots } = buildForest(nodes, links);
  const widths = new Map();
  const heights = new Map();
  for (const node of nodes) {
    widths.set(node.id, measureNodeWidth(node));
    heights.set(node.id, measureNodeHeight(node));
  }

  // Subtree span: the node's own width or the laid-out children span.
  const spans = new Map();
  function span(id) {
    if (spans.has(id)) return spans.get(id);
    const kids = children.get(id) || [];
    if (!kids.length) {
      spans.set(id, widths.get(id));
      return spans.get(id);
    }
    const total = kids.reduce((sum, kid) => sum + span(kid), 0) + gapX * (kids.length - 1);
    const own = Math.max(widths.get(id), total);
    spans.set(id, own);
    return own;
  }
  // Populate spans bottom-up before placement: place() reads spans.get(id)
  // for every node, and an unpopulated entry would position it at NaN.
  for (const node of nodes) span(node.id);

  // Depth per node (BFS from each root) for row alignment.
  const depths = new Map();
  const queue = [];
  for (const root of roots) {
    if (!depths.has(root)) {
      depths.set(root, 0);
      queue.push(root);
    }
  }
  while (queue.length) {
    const id = queue.shift();
    for (const kid of children.get(id) || []) {
      if (!depths.has(kid)) {
        depths.set(kid, depths.get(id) + 1);
        queue.push(kid);
      }
    }
  }
  const maxDepth = Math.max(0, ...depths.values());

  // Row tops from the tallest node on each depth.
  const rowHeight = [];
  for (let depth = 0; depth <= maxDepth; depth += 1) {
    rowHeight[depth] = Math.max(
      64,
      ...nodes.filter((node) => depths.get(node.id) === depth).map((node) => heights.get(node.id)),
    );
  }
  const rowTop = [];
  let y = TREE.topMargin;
  for (let depth = 0; depth <= maxDepth; depth += 1) {
    rowTop[depth] = y;
    y += rowHeight[depth] + TREE.rowPitch;
  }

  // X assignment: forest left to right, each parent centered over children.
  const boxes = new Map();
  let cursor = TREE.marginX;
  function place(id, left) {
    const kids = children.get(id) || [];
    const own = spans.get(id);
    const totalKids = kids.length
      ? kids.reduce((sum, kid) => sum + spans.get(kid), 0) + gapX * (kids.length - 1)
      : 0;
    let kidX = left + (own - totalKids) / 2;
    for (const kid of kids) {
      place(kid, kidX);
      kidX += spans.get(kid) + gapX;
    }
    const cx = kids.length
      ? (boxes.get(kids[0]).cx + boxes.get(kids[kids.length - 1]).cx) / 2
      : left + own / 2;
    const w = widths.get(id);
    const depth = depths.get(id) ?? 0;
    boxes.set(id, {
      x: cx - w / 2,
      y: rowTop[depth],
      width: w,
      height: heights.get(id),
      cx,
      cy: rowTop[depth] + heights.get(id) / 2,
      depth,
    });
  }
  for (const root of roots) {
    place(root, cursor);
    cursor += spans.get(root) + forestGap;
  }

  snapNearAlignedMiddleChildren({ boxes, children });

  const right = Math.max(...[...boxes.values()].map((box) => box.x + box.width), TREE.marginX * 2);
  const bottom = Math.max(...[...boxes.values()].map((box) => box.y + box.height), TREE.topMargin * 2);
  return {
    boxes,
    byId,
    children,
    parentOf,
    roots,
    depths,
    maxDepth,
    gaps: { gapX, forestGap },
    width: right + TREE.marginX,
    height: bottom + 40,
  };
}

// A parent centers over the span of its children, so an asymmetric sibling
// set can leave a middle child's center a few pixels off the parent axis.
// That offset would route as a sub-floor horizontal bus sliver on an
// otherwise straight elbow (a showcase micro-segment whose edge moves with
// link input order). Nudge a middle child's whole subtree onto the parent
// axis when the drift is below the 16px interior-segment floor: the shift is
// smaller than any sibling gap, first/last children (which define the parent
// center) never move, and descendants translate rigidly, so no new overlap
// or bend appears. Layouts with no sub-floor drift are untouched.
function snapNearAlignedMiddleChildren({ boxes, children }) {
  for (const [parentId, kids] of children) {
    if (kids.length < 3) continue;
    const parent = boxes.get(parentId);
    if (!parent) continue;
    for (let index = 1; index < kids.length - 1; index += 1) {
      const box = boxes.get(kids[index]);
      if (!box) continue;
      const drift = parent.cx - box.cx;
      if (Math.abs(drift) < 1 || Math.abs(drift) >= 16) continue;
      shiftSubtree(boxes, children, kids[index], drift);
    }
  }
}

function shiftSubtree(boxes, children, id, dx) {
  const box = boxes.get(id);
  if (!box) return;
  box.x += dx;
  box.cx += dx;
  for (const kid of children.get(id) || []) shiftSubtree(boxes, children, kid, dx);
}

// Count the squeezable gap slots for budget relief: one sibling slot per
// non-first child plus one forest slot per non-first root.
export function forestGapCounts(nodes, links) {
  const { children, roots } = buildForest(nodes, links);
  let siblingSlots = 0;
  for (const kids of children.values()) siblingSlots += Math.max(0, kids.length - 1);
  return { siblingSlots, forestSlots: Math.max(0, roots.length - 1) };
}

// Elbow route for one parent/child link. Returns SVG points
// (parent-bottom, bus corners, child-top) for composition checks.
export function elbowPoints(layout, parentId, childId) {
  const parent = layout.boxes.get(parentId);
  const child = layout.boxes.get(childId);
  if (!parent || !child) return [];
  const startX = parent.cx;
  const startY = parent.y + parent.height;
  const endX = child.cx;
  const endY = child.y;
  if (Math.abs(endX - startX) < 1) {
    return [[startX, startY], [endX, endY]];
  }
  const busY = startY + TREE.stubLen;
  return [[startX, startY], [startX, busY], [endX, busY], [endX, endY]];
}

// Horizontal bus segment shared by a parent's children (one decorative path
// per parent keeps the canvas honest: per-link elbows stay semantic edges).
export function busSegment(layout, parentId) {
  const kids = layout.children.get(parentId) || [];
  if (kids.length < 2) return null;
  const parent = layout.boxes.get(parentId);
  if (!parent) return null;
  const busY = parent.y + parent.height + TREE.stubLen;
  const xs = kids.map((kid) => layout.boxes.get(kid)?.cx ?? parent.cx);
  return { y: busY, x1: Math.min(...xs), x2: Math.max(...xs) };
}
