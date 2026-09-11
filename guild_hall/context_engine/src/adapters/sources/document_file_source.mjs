// Read-only source adapter over owner-named document files below a document root.
// UTF-8 text and Markdown become paragraph units that keep their heading path;
// PDF waits for the APP's pinned PDF preparation to be bound to a trusted
// interpreter, and other formats (HWP/HWPX/Office) are refused here, not guessed.
// File timestamps are untrusted hints, so documents carry no valid time.
import { openSourceRoot, SourceReadError } from './guarded_files.mjs';
import { buildSourceDocument, SourceDocumentError } from '../../runtime/source_documents.mjs';

export const DOCUMENT_SOURCE_ADAPTER = 'document-file-v1';
const MAX_TEXT_BYTES = 16 * 1024 * 1024;
const TEXT_FORMATS = Object.freeze({ '.txt': 'text', '.md': 'markdown', '.markdown': 'markdown' });
const HEADING = /^(#{1,6})\s+(.+?)\s*#*\s*$/u;

class DocumentSourceError extends Error {
  constructor(code) { super(code); this.code = code; }
}
const codeOf = error => (error instanceof DocumentSourceError || error instanceof SourceReadError
  || error instanceof SourceDocumentError) ? error.code : 'adapter_failed';
const extension = name => { const index = name.lastIndexOf('.'); return index > 0 ? name.slice(index).toLowerCase() : ''; };

// Paragraphs are separated by blank lines; Markdown headings start a new section
// and are kept as their own unit so each paragraph knows which section it is in.
export function paragraphUnits(text, format, path) {
  const lines = text.split('\n'), units = [], headings = [];
  let buffer = [], startLine = 0;
  const flush = endLine => {
    if (buffer.length && buffer.some(line => line.trim())) {
      units.push({ unit_kind: 'paragraph', text: buffer.join('\n'), occurred_at: null, speaker_ref: null,
        locator: { path: [...path], line_start: startLine + 1, line_end: endLine, section: headings.map(h => h.text) } });
    }
    buffer = [];
  };
  lines.forEach((line, index) => {
    const heading = format === 'markdown' ? HEADING.exec(line) : null;
    if (heading) {
      flush(index);
      const level = heading[1].length;
      while (headings.length && headings.at(-1).level >= level) headings.pop();
      headings.push({ level, text: heading[2] });
      units.push({ unit_kind: 'heading', text: heading[2], occurred_at: null, speaker_ref: null,
        locator: { path: [...path], line_start: index + 1, line_end: index + 1, section: headings.map(h => h.text) } });
      startLine = index + 1;
    } else if (!line.trim()) {
      flush(index);
      startLine = index + 1;
    } else {
      if (!buffer.length) startLine = index;
      buffer.push(line);
    }
  });
  flush(lines.length);
  return units;
}

export async function readDocumentSourceDocuments({ admitted, source, rootPath }) {
  const results = [], documents = [];
  const outcome = (item, status, extra = {}) => results.push({ source_kind: 'document', root_ref: source.root_ref,
    item_id: item.item_id, status, ...extra });
  let root;
  try { root = openSourceRoot(rootPath); } catch (error) {
    for (const item of source.items) outcome(item, 'failed', { code: codeOf(error) });
    return { documents, results };
  }
  for (const item of source.items) {
    try {
      const ext = extension(item.path.at(-1));
      const format = TEXT_FORMATS[ext];
      if (ext === '.pdf') { outcome(item, 'failed', { code: 'pdf_preparation_not_connected' }); continue; }
      if (!format) { outcome(item, 'refused', { code: 'unsupported_document_format' }); continue; }
      let file;
      try { file = await root.readText(item.path, MAX_TEXT_BYTES); } catch (error) {
        if (error?.code === 'source_missing') { outcome(item, 'missing', { code: 'source_missing' }); continue; }
        throw error;
      }
      if (item.revision_policy === 'exact' && file.sha256 !== item.revision_sha256) {
        outcome(item, 'stale_grant', { code: 'granted_revision_absent' }); continue;
      }
      const units = paragraphUnits(file.text.replace(/\r\n?/gu, '\n'), format, item.path);
      if (units.length === 0) { outcome(item, 'missing', { code: 'document_empty' }); continue; }
      const title = units.find(unit => unit.unit_kind === 'heading')?.text ?? item.path.at(-1);
      const document = buildSourceDocument({ admitted, sourceKind: 'document', rootRef: source.root_ref, item,
        adapterProfile: DOCUMENT_SOURCE_ADAPTER, primaryRevisionSha256: file.sha256, components: [], title,
        validAt: null, knownAt: null, timeBasis: 'untimed_document',
        facts: [{ name: 'document.format', value: format, at: null }, { name: 'document.bytes', value: file.bytes, at: null },
          { name: 'document.unit_count', value: units.length, at: null }], units });
      documents.push(document);
      outcome(item, 'prepared', { composite_revision_sha256: document.composite_revision_sha256, doc_key: document.doc_key });
    } catch (error) {
      outcome(item, 'failed', { code: codeOf(error) });
    }
  }
  return { documents, results };
}
