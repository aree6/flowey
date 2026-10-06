// Subject-neutral source citations. Unlike repository evidence, citations are
// never verified against external systems: they record where the author got
// the facts (notes, a URL, a PDF page, an interviewee, a document) so readers
// can judge provenance themselves. The viewer renders a count badge per cited
// node and lists the citations in the passport panel.
const CITATION_NODE_COLLECTIONS = {
  architecture: 'components',
  workflow: 'nodes',
  sequence: 'participants',
  dataflow: 'nodes',
  lifecycle: 'states',
};

function isCitation(value) {
  return Boolean(value) && typeof value === 'object' && typeof value.label === 'string' && value.label.length > 0;
}

function cleanCitation(value) {
  const out = { label: String(value.label) };
  if (typeof value.detail === 'string' && value.detail.length > 0) out.detail = value.detail;
  if (typeof value.ref === 'string' && value.ref.length > 0) out.ref = value.ref;
  return out;
}

export function collectCitations(diagramType, diagram) {
  const collection = CITATION_NODE_COLLECTIONS[diagramType];
  if (!collection) return null;
  const list = Array.isArray(diagram?.[collection]) ? diagram[collection] : [];
  const nodes = {};
  for (const node of list) {
    if (!node || typeof node.id !== 'string') continue;
    const cited = Array.isArray(node.citations) ? node.citations.filter(isCitation).map(cleanCitation) : [];
    if (cited.length > 0) nodes[node.id] = cited;
  }
  if (Object.keys(nodes).length === 0) return null;
  return { cited: true, nodes };
}
