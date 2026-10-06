// Re-render every bundled example from its JSON IR. Installed skills keep HTML
// beside the JSON examples; the development script passes the golden directory.

import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const skillRoot = path.resolve(__dirname, '..');
const outputRoot = path.resolve(process.argv[2] || path.join(skillRoot, 'examples'));

const TARGETS = [
  ['workflow', 'agent-tool-call.workflow.json', 'workflow-agent-tool-call-rendered.html'],
  ['sequence', 'cache-miss-request.sequence.json', 'sequence-cache-miss-request.html'],
  ['dataflow', 'product-analytics.dataflow.json', 'dataflow-product-analytics.html'],
  ['lifecycle', 'agent-run.lifecycle.json', 'lifecycle-agent-run.html'],
  ['architecture', 'web-app.architecture.json', 'web-app-rendered.html'],
  ['hierarchy', 'org-chart.hierarchy.json', 'hierarchy-org-chart.html'],
  ['workflow', 'leave-approval.workflow.json', 'leave-approval.workflow.html'],
  ['architecture', 'leave-approval.architecture.json', 'leave-approval.architecture.html'],
  ['sequence', 'clinic-visit.sequence.json', 'clinic-visit.sequence.html'],
  ['dataflow', 'scholarship-disbursement.dataflow.json', 'scholarship-disbursement.dataflow.html'],
  ['lifecycle', 'visa-application.lifecycle.json', 'visa-application.lifecycle.html'],
];

for (const [mode, input, output] of TARGETS) {
  execFileSync(process.execPath, [
    path.join(skillRoot, `renderers/${mode}/render-${mode}.mjs`),
    path.join(skillRoot, 'examples', input),
    path.join(outputRoot, output),
  ], { stdio: 'inherit' });
}
