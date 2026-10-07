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
  // Rank by how many query words hit the glyph name or tags: a multi-word
  // query narrows to the best matches instead of returning nothing when one
  // word misses. Words under 3 characters only count on an exact token hit
  // (so "db" still finds the database tag but "xyz" noise matches nothing).
  return names
    .map((name) => {
      const tags = glyphs[name].tags || [];
      const hay = `${name} ${tags.join(' ')}`.toLocaleLowerCase('en-US');
      const tokens = new Set(hay.split(/[\s_-]+/));
      const score = words.filter((word) => (word.length >= 3 ? hay.includes(word) : tokens.has(word))).length;
      return { name, ...glyphs[name], score };
    })
    .filter((match) => match.score > 0)
    .sort((a, b) => b.score - a.score || (a.name < b.name ? -1 : 1))
    .map(({ score, ...match }) => match);
}

// Closest catalog names to a no-match query, for "did you mean" hints.
// Substring affinity plus single-typo tolerance only: looser fuzzy guesses
// mislead more than they help.
function typoDistance(a, b) {
  if (a[0] !== b[0] || Math.abs(a.length - b.length) > 1) return Infinity;
  let edits = 0;
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i += 1; j += 1; continue; }
    edits += 1;
    if (edits > 1) return Infinity;
    if (a.length > b.length) i += 1;
    else if (b.length > a.length) j += 1;
    else { i += 1; j += 1; }
  }
  return edits + (a.length - i) + (b.length - j);
}

export function suggestIcons(query, limit = 3) {
  const glyphs = readCatalog();
  const words = String(query || '').toLocaleLowerCase('en-US').split(/[\s_-]+/).filter(Boolean);
  if (!words.length) return [];
  const names = Object.keys(glyphs).sort();
  const scored = names.map((name) => {
    const tags = glyphs[name].tags || [];
    const tokens = `${name} ${tags.join(' ')}`.toLocaleLowerCase('en-US').split(/[\s_-]+/);
    let best = Infinity;
    for (const word of words) {
      if (word.length < 4) continue;
      for (const token of tokens) {
        if (token.length >= 4 && (token.includes(word) || word.includes(token))) { best = 0; break; }
        if (word.length >= 5 && token.length >= 5 && typoDistance(word, token) <= 1) best = Math.min(best, 1);
      }
      if (best === 0) break;
    }
    return { name, best };
  });
  return scored.filter((s) => s.best <= 1).sort((a, b) => a.best - b.best).slice(0, limit).map((s) => s.name);
}

export function emitIcon(name) {  const glyphs = readCatalog();
  if (!glyphs[name]) {
    const error = new Error(`Unknown icon ${JSON.stringify(name)}. Run "flowey icons <words>" to search.`);
    error.code = 'icons/unknown-icon';
    throw error;
  }
  const svg = fs.readFileSync(path.join(iconsDir, `${name}.svg`), 'utf8');
  const inner = svg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '').trim();
  return `<g class="sigil-fill" transform="scale(0.0625)">${inner}</g>`;
}
