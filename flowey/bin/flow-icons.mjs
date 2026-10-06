// Icon search: keywords in, vendored Phosphor glyphs out.
//
//   node bin/flowey.mjs icons database
//   node bin/flowey.mjs icons "pay fee" --emit --limit 1
//
// Searches the repo-vendored icons/catalog.json (paths relative to the
// package root, never absolute). Every word must match the glyph name or one
// of its tags. --emit prints the finished corner-stamp <g> markup; otherwise
// prints the glyph name plus tags so the agent can set node `icon:`.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const catalogPath = path.join(root, 'icons', 'catalog.json');
const iconsDir = path.join(root, 'icons', 'phosphor');

function readCatalog() {
  return JSON.parse(fs.readFileSync(catalogPath, 'utf8')).glyphs || {};
}

export function searchIcons(query) {
  const glyphs = readCatalog();
  const words = String(query || '').toLocaleLowerCase('en-US').split(/[\s_-]+/).filter(Boolean);
  const names = Object.keys(glyphs).sort();
  if (!words.length) return names.map((name) => ({ name, ...glyphs[name] }));
  return names
    .filter((name) => {
      const hay = `${name} ${(glyphs[name].tags || []).join(' ')}`.toLocaleLowerCase('en-US');
      return words.every((word) => hay.includes(word));
    })
    .map((name) => ({ name, ...glyphs[name] }));
}

export function emitIcon(name) {
  const glyphs = readCatalog();
  if (!glyphs[name]) {
    const error = new Error(`Unknown icon ${JSON.stringify(name)}. Run "flowey icons <words>" to search.`);
    error.code = 'icons/unknown-icon';
    throw error;
  }
  const svg = fs.readFileSync(path.join(iconsDir, `${name}.svg`), 'utf8');
  const inner = svg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '').trim();
  return `<g class="sigil-fill" transform="scale(0.0625)">${inner}</g>`;
}
