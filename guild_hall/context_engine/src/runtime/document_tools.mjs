// Closed host-only parser configuration shared by preparation, graph sync and
// original read. Grants and source items never carry executable paths.
import { isAbsolute } from 'node:path';
import process from 'node:process';
import { types } from 'node:util';
import { PREPARATION_PROFILE } from '../../algorithms/preparation/pinned_pdf_v1.mjs';
import { DOCX_PREPARATION_PROFILE } from '../../algorithms/preparation/pinned_docx_v1.mjs';

const PROFILES = Object.freeze({ pdf: PREPARATION_PROFILE, docx: DOCX_PREPARATION_PROFILE });
const OPTION_KEYS = Object.freeze(['interpreterPath', 'extractionProfile', 'disableSiteStartup']);
const WINDOWS_EXECUTABLE = /^(?:[a-z]:[\\/]|[\\/]{2}[^\\/]+[\\/][^\\/]+[\\/])/iu;

export class DocumentToolsError extends Error {
  constructor(code = 'document_tools_invalid') { super(code); this.name = 'DocumentToolsError'; this.code = code; }
}
const fail = () => { throw new DocumentToolsError(); };
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value)
  && !types.isProxy(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const ownData = (value, key) => {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (!descriptor || !Object.hasOwn(descriptor, 'value')) fail();
  return descriptor.value;
};

export function validateDocumentTools(value) {
  if (value === undefined || value === null) return null;
  if (!plain(value)) fail();
  const formats = Reflect.ownKeys(value);
  if (formats.length < 1 || formats.length > 2 || formats.some(key => typeof key !== 'string' || !Object.hasOwn(PROFILES, key))) fail();
  const output = {};
  for (const format of formats) {
    const options = ownData(value, format);
    if (!plain(options)) fail();
    const keys = Reflect.ownKeys(options);
    if (![2, 3].includes(keys.length) || keys.some(key => typeof key !== 'string' || !OPTION_KEYS.includes(key))
      || !keys.includes('interpreterPath') || !keys.includes('extractionProfile')) fail();
    const interpreterPath = ownData(options, 'interpreterPath');
    const extractionProfile = ownData(options, 'extractionProfile');
    const hasSiteFlag = keys.includes('disableSiteStartup');
    const disableSiteStartup = hasSiteFlag ? ownData(options, 'disableSiteStartup') : false;
    if (typeof interpreterPath !== 'string' || interpreterPath.length < 1 || interpreterPath.length > 4096
      || !isAbsolute(interpreterPath) || /[\x00-\x1f]/u.test(interpreterPath)
      || (process.platform === 'win32' && !WINDOWS_EXECUTABLE.test(interpreterPath))
      || extractionProfile !== PROFILES[format] || typeof disableSiteStartup !== 'boolean'
      || (disableSiteStartup && process.platform !== 'win32')) fail();
    output[format] = Object.freeze({ interpreterPath, extractionProfile,
      ...(hasSiteFlag ? { disableSiteStartup } : {}) });
  }
  return Object.freeze(output);
}
