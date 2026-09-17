// Read-only source adapter over owner-named document files below a document root.
// UTF-8 text and Markdown become paragraph units that keep their heading path;
// PDF uses the APP's fixed extraction unit only when a trusted host binding is
// supplied separately from the source grant; other formats are refused here,
// not guessed.
// File timestamps are untrusted hints, so documents carry no valid time.
import { openSourceRoot, SourceReadError } from './guarded_files.mjs';
import { buildSourceDocument, normalizeText, SOURCE_LIMITS, SourceDocumentError } from '../../runtime/source_documents.mjs';
import { PREPARATION_PROFILE, PREPARATION_WORKER_SHA256,
  preparePinnedPdfCandidate } from '../../../algorithms/preparation/pinned_pdf_v1.mjs';

export const DOCUMENT_SOURCE_ADAPTER = 'document-file-v1';
const MAX_TEXT_BYTES = 16 * 1024 * 1024;
const TEXT_FORMATS = Object.freeze({ '.txt': 'text', '.md': 'markdown', '.markdown': 'markdown' });
const HEADING = /^(#{1,6})\s+(.+?)\s*#*\s*$/u;

class DocumentSourceError extends Error {
  constructor(code) { super(code); this.code = code; }
}
const codeOf = error => (error instanceof DocumentSourceError || error instanceof SourceReadError
  || error instanceof SourceDocumentError) ? error.code
  : error?.code === 'pdf_unreadable' ? 'pdf_unreadable'
    : error?.code === 'pdf_preparation_worker_changed' ? 'pdf_preparation_worker_changed'
    : error?.code === 'request_invalid' ? 'pdf_preparation_tool_invalid'
      : error?.code === 'input_digest_mismatch' ? 'pdf_preparation_digest_mismatch'
        : error?.code === 'input_bytes_too_large' ? 'source_too_large' : 'adapter_failed';
const extension = name => { const index = name.lastIndexOf('.'); return index > 0 ? name.slice(index).toLowerCase() : ''; };
const fail = code => { throw new DocumentSourceError(code); };

function trustedPdfOptions(documentTools) {
  if (documentTools === null || documentTools === undefined) return null;
  if (typeof documentTools !== 'object' || Array.isArray(documentTools)
    || Object.getPrototypeOf(documentTools) !== Object.prototype
    || Object.keys(documentTools).length !== 1 || !Object.hasOwn(documentTools, 'pdf')) fail('pdf_preparation_tool_invalid');
  const pdf = documentTools.pdf;
  const keys = typeof pdf === 'object' && pdf !== null ? Object.keys(pdf) : [];
  if (typeof pdf !== 'object' || pdf === null || Array.isArray(pdf)
    || Object.getPrototypeOf(pdf) !== Object.prototype
    || !['extractionProfile', 'interpreterPath'].every(key => Object.hasOwn(pdf, key))
    || ![2, 3].includes(keys.length)
    || keys.some(key => !['disableSiteStartup', 'extractionProfile', 'interpreterPath'].includes(key))) {
    fail('pdf_preparation_tool_invalid');
  }
  return { interpreterPath: pdf.interpreterPath, extractionProfile: pdf.extractionProfile,
    ...(Object.hasOwn(pdf, 'disableSiteStartup') ? { disableSiteStartup: pdf.disableSiteStartup } : {}) };
}

const characters = text => [...text].length;
const boundedPdfText = value => {
  const text = normalizeText(value, Number.MAX_SAFE_INTEGER);
  if (characters(text) > SOURCE_LIMITS.unit_characters) fail('pdf_preparation_unit_limit_exceeded');
  return text;
};

// Converts the already validated pinned-parser result into source units. It
// refuses the whole document before buildSourceDocument can silently truncate a
// unit or admit only a prefix as a complete preparation.
export function pdfSourceUnits(extraction, sourcePath, sourceSha256) {
  const units = [];
  let totalCharacters = 0;
  const add = (unitKind, textValue, locator) => {
    const text = boundedPdfText(textValue);
    if (!text) return;
    const count = characters(text);
    if (units.length >= SOURCE_LIMITS.document_units
      || totalCharacters + count > SOURCE_LIMITS.document_characters) fail('pdf_preparation_document_limit_exceeded');
    totalCharacters += count;
    units.push({ unit_kind: unitKind, text, occurred_at: null, speaker_ref: null,
      locator: { path: [...sourcePath], source_sha256: sourceSha256, ...locator } });
  };
  for (const page of extraction.pages) {
    const pageLocator = { page_number: page.page_number, coordinate_system: page.coordinate_system };
    const pageStart = units.length;
    for (const paragraph of page.paragraphs) {
      add('pdf_paragraph', paragraph.text,
        { ...pageLocator, paragraph_number: paragraph.paragraph_number, bbox: [...paragraph.bbox] });
    }
    for (const table of page.tables) for (const cell of table.cells) {
      if (cell.text !== null) add('pdf_table_cell', cell.text, { ...pageLocator, table_number: table.table_number,
        row_number: cell.row_number, column_number: cell.column_number, bbox: [...cell.bbox] });
    }
    // A valid parser page may have text but no structured paragraph (for
    // example, unusual page geometry). Preserve it at page granularity rather
    // than dropping it; table pages already have cell locators and are not
    // duplicated through this fallback.
    if (units.length === pageStart && page.text) add('pdf_page', page.text, pageLocator);
    if (units.length === pageStart) fail('pdf_page_content_unavailable');
  }
  return Object.freeze({ units: Object.freeze(units), characters: totalCharacters });
}

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

export async function readDocumentSourceDocuments({ admitted, source, rootPath, documentTools = null }) {
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
      if (ext === '.pdf') {
        const options = trustedPdfOptions(documentTools);
        if (options === null) { outcome(item, 'failed', { code: 'pdf_preparation_not_connected' }); continue; }
        let file;
        try { file = await root.readBytes(item.path, MAX_TEXT_BYTES); } catch (error) {
          if (error?.code === 'source_missing') { outcome(item, 'missing', { code: 'source_missing' }); continue; }
          throw error;
        }
        if (item.revision_policy === 'exact' && file.sha256 !== item.revision_sha256) {
          outcome(item, 'stale_grant', { code: 'granted_revision_absent' }); continue;
        }
        const candidate = await preparePinnedPdfCandidate({ pdfBytes: file.bytes, expectedSha256: file.sha256.slice(7) }, options);
        if (candidate.source.sha256 !== file.sha256.slice(7) || candidate.source.byte_count !== file.byte_count
          || candidate.extraction.profile !== PREPARATION_PROFILE || candidate.extraction.engine !== 'pdfplumber') {
          fail('pdf_preparation_result_invalid');
        }
        const prepared = pdfSourceUnits(candidate.extraction, item.path, file.sha256);
        const extractionSha256 = `sha256:${candidate.extraction.extraction_sha256}`;
        const components = [
          { kind: 'pdf_worker', id: PREPARATION_PROFILE, sha256: PREPARATION_WORKER_SHA256 },
          { kind: 'pdf_extraction', id: `pdfplumber-${candidate.extraction.engine_version}`, sha256: extractionSha256 },
        ];
        const document = buildSourceDocument({ admitted, sourceKind: 'document', rootRef: source.root_ref, item,
          adapterProfile: DOCUMENT_SOURCE_ADAPTER, primaryRevisionSha256: file.sha256, components, title: item.path.at(-1),
          validAt: null, knownAt: null, timeBasis: 'untimed_document', facts: [
            { name: 'document.format', value: 'pdf', at: null },
            { name: 'document.bytes', value: file.byte_count, at: null },
            { name: 'document.unit_count', value: prepared.units.length, at: null },
            { name: 'document.page_count', value: candidate.extraction.page_count, at: null },
            { name: 'document.parser_profile', value: candidate.extraction.profile, at: null },
            { name: 'document.parser_engine', value: candidate.extraction.engine, at: null },
            { name: 'document.parser_version', value: candidate.extraction.engine_version, at: null },
            { name: 'document.worker_sha256', value: PREPARATION_WORKER_SHA256, at: null },
            { name: 'document.extraction_sha256', value: extractionSha256, at: null },
          ], units: prepared.units });
        documents.push(document);
        outcome(item, 'prepared', { composite_revision_sha256: document.composite_revision_sha256, doc_key: document.doc_key });
        continue;
      }
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
