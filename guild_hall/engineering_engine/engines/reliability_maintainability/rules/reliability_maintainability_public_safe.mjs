// Closed public-safe lexical policy for E06 references, locators, and receipt identifiers.
// It is deliberately local to the R&M package: it does not redefine Core identity semantics.
import { ContractError } from '../../../core/validators/errors.mjs';

export const RM_OPAQUE_TOKEN = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/u;
const RM_RECEIPT_TOKEN = /^receipt:[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/u;
const OFFICIAL_HTTPS_HOSTS = new Set([
  'acquisition.gov',
  'nasa.gov',
  'ntrs.nasa.gov',
  'quicksearch.dla.mil',
  'standards.nasa.gov',
]);

export function isForbiddenHost(rawHost) {
  if (typeof rawHost !== 'string' || rawHost.length === 0) return false;
  const host = rawHost.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
    return true;
  }
  // IPv4 dotted-decimal
  const ipv4Match = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    const a = Number(ipv4Match[1]);
    const b = Number(ipv4Match[2]);
    const c = Number(ipv4Match[3]);
    const d = Number(ipv4Match[4]);
    if (a > 255 || b > 255 || c > 255 || d > 255) return true;
    if (a === 0 || a === 127 || a === 10) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
  }
  // IPv6
  if (host.includes(':')) {
    if (host === '::' || host === '::1' || host === '0:0:0:0:0:0:0:0' || host === '0:0:0:0:0:0:0:1') {
      return true;
    }
    // ULA (fc00::/7) or Link-Local (fe80::/10)
    if (/^f[cd]/i.test(host) || /^fe[89ab]/i.test(host)) {
      return true;
    }
    // IPv4-mapped IPv6
    if (host.startsWith('::ffff:') || host.startsWith('0:0:0:0:0:ffff:')) {
      const suffix = host.replace(/^0:0:0:0:0:ffff:|^::ffff:/i, '');
      if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(suffix)) {
        return isForbiddenHost(suffix);
      }
      const hexParts = suffix.split(':');
      if (hexParts.length === 2 && /^[0-9a-f]{1,4}$/i.test(hexParts[0]) && /^[0-9a-f]{1,4}$/i.test(hexParts[1])) {
        const hi = parseInt(hexParts[0], 16);
        const lo = parseInt(hexParts[1], 16);
        const ip = `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
        return isForbiddenHost(ip);
      }
      return true;
    }
  }
  return false;
}

export const RM_PUBLIC_UNSAFE_PATTERNS = Object.freeze([
  /(?:^|[^A-Za-z0-9_])_workspaces(?:[\\/]|$)/iu,
  /(?:^|[^A-Za-z0-9_])_workmeta(?:[\\/]|$)/iu,
  /(?:^|[^A-Za-z0-9_])private-state(?:[\\/]|$)/iu,
  /(?:^|[^A-Za-z0-9])[a-z]:[\\/]/iu,
  /^[A-Za-z]:[\\/]/u,
  /^[A-Za-z]:\b/u,
  /^\\\\/u,
  /\\\\[^\\]+\\/u,
  /(?:^|[^A-Za-z0-9_])\/(?:tmp|temp|var|etc|opt|srv|usr|bin|sbin|lib|dev|proc|sys|root|home|users|mnt|media|private|data|workspace|workspaces)(?:\/|$)/iu,
  /\/(?:workspace|workspaces)\/private(?:\/|$)/iu,
  /^file:/iu,
  /file:\/\//iu,
  /-----BEGIN [A-Z ]+PRIVATE KEY-----/u,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/u,
  /\b(?:bearer)\b/iu,
  /\bgh[pousr]_[A-Za-z0-9_]{10,}/iu,
  /\bgh[pousr]_/iu,
  /\bgithub_pat_[A-Za-z0-9_]{10,}/iu,
  /\bsk-[A-Za-z0-9_-]{10,}/iu,
  /\bsk-/iu,
  /\bxox[bpar]-[A-Za-z0-9_-]+/iu,
  /\bxox[bpar]-/iu,
  /\bAIza[0-9A-Za-z-_]{35}/u,
  /\b(?:api[_-]?key)\b/iu,
  /\b(?:password|passwd|secret)\b/iu,
  /\b(?:password|passwd|api[_-]?key|access[_-]?token|refresh[_-]?token)\s*[:=]/iu,
  /\blocalhost\b/iu,
]);

function reject(code, message, detail = {}) {
  throw new ContractError(code, message, detail);
}

export function isRmPublicSafeString(value, maxLength = 512) {
  if (typeof value !== 'string' || value.length === 0 || value.length > maxLength
      || value.normalize('NFC') !== value || /[\u0000-\u001f\u007f]/u.test(value)) {
    return false;
  }
  for (const pattern of RM_PUBLIC_UNSAFE_PATTERNS) {
    if (pattern.test(value)) {
      return false;
    }
  }
  if (isForbiddenHost(value)) {
    return false;
  }
  if (value.startsWith('//') || value.includes('/') || value.includes(':')) {
    try {
      const target = value.startsWith('//') ? 'http:' + value : (value.includes('://') ? value : 'http://' + value);
      const parsed = new URL(target);
      if (parsed.protocol === 'file:' || parsed.protocol === 'javascript:' || parsed.protocol === 'data:') {
        return false;
      }
      if (isForbiddenHost(parsed.hostname)) {
        return false;
      }
    } catch {}
  }

  const matches = value.match(/[a-zA-Z][a-zA-Z0-9+.-]*:\/\/[^\s"'<>]+/g);
  if (matches) {
    for (const match of matches) {
      try {
        const parsed = new URL(match);
        if (parsed.protocol === 'file:' || parsed.protocol === 'javascript:' || parsed.protocol === 'data:') {
          return false;
        }
        if (isForbiddenHost(parsed.hostname)) {
          return false;
        }
      } catch {
        return false;
      }
    }
  }

  return true;
}

export function assertRmPublicSafeString(value, {
  code,
  field = 'value',
  maxLength = 512,
} = {}) {
  if (!isRmPublicSafeString(value, maxLength)) {
    reject(code, 'value contains a local/private path, file URI, credential, forbidden host, or payload sentinel', { field });
  }
  return value;
}

export function assertRmOpaqueToken(value, options = {}) {
  const safe = assertRmPublicSafeString(value, options);
  if (!RM_OPAQUE_TOKEN.test(safe)) {
    reject(options.code, 'value must be a bounded public-safe opaque token', { field: options.field ?? 'value' });
  }
  return safe;
}

export function assertRmReceiptRef(value, options = {}) {
  const safe = assertRmPublicSafeString(value, options);
  if (!RM_RECEIPT_TOKEN.test(safe)) {
    reject(options.code, 'test receipt ref must use the closed receipt:<opaque-token> grammar', { field: options.field ?? 'test_receipt_ref' });
  }
  return safe;
}

export function assertRmPublicSafeLocator(value, options = {}) {
  const safe = assertRmPublicSafeString(value, options);
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/u.test(safe)) {
    let url;
    try {
      url = new URL(safe);
    } catch {
      reject(options.code, 'locator URI is malformed', { field: options.field ?? 'source_locator' });
    }
    if (url.protocol !== 'https:' || !OFFICIAL_HTTPS_HOSTS.has(url.hostname)) {
      reject(options.code, 'locator URI must use an explicitly allowed official HTTPS host', { field: options.field ?? 'source_locator' });
    }
  }
  return safe;
}
