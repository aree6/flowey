#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'flowey/assets/template.html');
// Each fragment maps a marker in `viewer/template.source.html` to a file in
// `viewer/`. The optional indent re-prefixes every non-empty source line so
// the inlined block sits inside the surrounding `<style>` / `<script>` tags at
// the same depth the marker occupies. JS fragments need no indent because their
// markers are already at column 0; the standalone CSS file needs four spaces.
const fragments = [
  ['/* FLOWEY:VIEWER_CSS */', 'viewer.css', 4],
  ['/* FLOWEY:EXPORT */', 'export.js'],
  ['/* FLOWEY:READER_LAYOUT */', 'reader-layout.js'],
  ['/* FLOWEY:CHROME_LAYOUT */', 'viewer-chrome-layout.js'],
  ['/* FLOWEY:CAMERA */', 'viewer-camera.js'],
  ['/* FLOWEY:RADAR */', 'semantic-radar.js'],
  ['/* FLOWEY:MOTION_GOVERNOR */', 'motion-governor.js'],
  ['/* FLOWEY:NODE_FINDER */', 'node-finder.js'],
  ['/* FLOWEY:NODE_OUTLINE */', 'node-outline.js'],
  ['/* FLOWEY:FOCUS */', 'focus.js'],
  ['/* FLOWEY:INTENT_TRACE */', 'intent-trace.js'],
  ['/* FLOWEY:SEMANTIC_LENS */', 'semantic-lens.js'],
  ['/* FLOWEY:ROUTE_PROBE */', 'route-probe.js'],
  ['/* FLOWEY:EXPORT_CLEANUP */', 'export-cleanup.js'],
];
const childMarker = '/* FLOWEY:EXPORT_CLEANUP */';
const childOwner = 'export.js';

function reindent(source, spaces) {
  if (!spaces) return source;
  const pad = ' '.repeat(spaces);
  return source
    .split('\n')
    .map((line) => (line.length === 0 ? line : pad + line))
    .join('\n');
}

try {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args.length === 1 && args[0] !== '--check')) {
    throw new Error('Usage: node scripts/generate-viewer.mjs [--check]');
  }
  let generated = fs.readFileSync(path.join(root, 'viewer/template.source.html'), 'utf8');
  for (const [marker, file, indent = 0] of fragments) {
    const source = fs.readFileSync(path.join(root, 'viewer', file), 'utf8');
    const parts = generated.split(marker);
    if (parts.length !== 2) throw new Error(`Viewer source must contain exactly one ${file} marker.`);
    // Export owns the sole nested fragment; expand it before Cleanup.
    const expectedChild = file === childOwner ? childMarker : null;
    if (!source.trim() || (expectedChild && source.split(expectedChild).length !== 2) ||
        fragments.some(([slot]) => source.includes(slot) && slot !== expectedChild)) {
      throw new Error(`${file} source is empty or contains an unresolved marker.`);
    }
    // For indented fragments the marker line in the template ends with `\n`;
    // `split` leaves that `\n` at the head of `parts[1]`. Strip it so the
    // reindented source's trailing newline is the only separator — without
    // this we'd emit a blank line between the fragment and the surrounding
    // CSS, and every byte after the seam would shift.
    let tail = parts[1];
    if (indent && tail.startsWith('\n')) tail = tail.slice(1);
    // Preserve classic-script scope, execution position and literal source bytes,
    // including characters with String.replace semantics.
    generated = parts[0] + reindent(source, indent) + tail;
  }
  if (args[0] === '--check') {
    if (!fs.existsSync(output) || fs.readFileSync(output, 'utf8') !== generated) {
      throw new Error('Viewer template is stale — run npm run generate:viewer from flowey/.');
    }
  } else {
    const temporary = `${output}.${process.pid}.tmp`;
    try {
      fs.writeFileSync(temporary, generated);
      fs.renameSync(temporary, output);
    } finally {
      fs.rmSync(temporary, { force: true });
    }
    console.log('generated flowey/assets/template.html');
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
