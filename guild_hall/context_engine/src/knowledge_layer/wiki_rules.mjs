import { readFileSync } from 'node:fs';
import { hashText } from './data.mjs';
// Explicit construction-time read of one packaged public rule sheet, not sources.
export function loadWikiRules() {
  const text = readFileSync(new URL('../../WIKI_SCHEMA.md', import.meta.url), 'utf8');
  return Object.freeze({ text, sha256: hashText(text) });
}
