// PC-03 time semantics and PC-11 canonical serialisation.
//
// Two invariants drive every decision here.
//
// 1. The same canonical input must always produce the same bytes. Anything whose textual
//    form varies by platform, locale, or host library version is refused rather than
//    normalised, because a silent normalisation is indistinguishable from correctness
//    until two implementations disagree.
// 2. Ambiguity is refused, not resolved. Where a value could serialise two ways the
//    kernel raises instead of picking one, since picking one would make the fingerprint
//    depend on that choice.

import { CANONICAL, TIME_PRECISION } from './contract_config.mjs';
import { ContractError, CODES } from './errors.mjs';

// ---------------------------------------------------------------- ordering

// Compares by Unicode code point. The default string comparison orders by UTF-16 code
// unit, which puts some astral characters before BMP characters they should follow.
export function compareCodePoints(a, b) {
  const A = [...a], B = [...b];
  const n = Math.min(A.length, B.length);
  for (let i = 0; i < n; i++) {
    const d = A[i].codePointAt(0) - B[i].codePointAt(0);
    if (d !== 0) return d;
  }
  return A.length - B.length;
}

// ---------------------------------------------------------------- time (PC-03)

const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const isLeapYear = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const pad = (n, w) => String(n).padStart(w, '0');

export function daysInMonth(year, month) {
  return month === 2 && isLeapYear(year) ? 29 : MONTH_DAYS[month - 1];
}

const TIME_LIKE = /^\d{4}-\d{2}-\d{2}T/;
const TIME_PARTS = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\.(\d+)Z$/;

/**
 * Validates a canonical instant. Deliberately does not delegate to the host date
 * formatter: its output width is fixed, which would silently pin the fractional precision
 * regardless of what the contract declares.
 */
export function inspectInstant(value, digits = TIME_PRECISION.fractionalDigits) {
  if (typeof value !== 'string') return { valid: false, code: CODES.TIME_SHAPE_INVALID };
  const m = TIME_PARTS.exec(value);
  if (!m) return { valid: false, code: CODES.TIME_SHAPE_INVALID };
  const frac = m[7];
  if (!Number.isInteger(digits) || frac.length !== digits) {
    return { valid: false, code: CODES.TIME_PRECISION_MISMATCH, detail: { expected: digits, actual: frac.length } };
  }
  const [year, month, day, hour, minute, second] = m.slice(1, 7).map(Number);
  if (month < 1 || month > 12) return { valid: false, code: CODES.TIME_NOT_A_REAL_INSTANT, detail: { field: 'month' } };
  if (day < 1 || day > daysInMonth(year, month)) return { valid: false, code: CODES.TIME_NOT_A_REAL_INSTANT, detail: { field: 'day' } };
  if (hour > 23) return { valid: false, code: CODES.TIME_NOT_A_REAL_INSTANT, detail: { field: 'hour' } };
  if (minute > 59) return { valid: false, code: CODES.TIME_NOT_A_REAL_INSTANT, detail: { field: 'minute' } };
  // leap seconds are not representable in this contract
  if (second > 59) return { valid: false, code: CODES.TIME_NOT_A_REAL_INSTANT, detail: { field: 'second' } };
  const rebuilt = `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}T${pad(hour, 2)}:${pad(minute, 2)}:${pad(second, 2)}.${frac}Z`;
  if (rebuilt !== value) return { valid: false, code: CODES.TIME_NOT_A_REAL_INSTANT, detail: { field: 'padding' } };
  return { valid: true, parts: { year, month, day, hour, minute, second, fraction: frac } };
}

export const isCanonicalInstant = (v, digits) => inspectInstant(v, digits).valid;

export function looksLikeInstant(v) {
  return typeof v === 'string' && TIME_LIKE.test(v);
}

// ---------------------------------------------------------------- serialisation (PC-11)

const PLAIN_INTEGER = /^-?(0|[1-9][0-9]*)$/;
const EXPONENT_DECIMAL_STRING = /^[+-]?\d+(\.\d+)?[eE][+-]?\d+$/;

function childPath(path, key) {
  return path ? `${path}.${key}` : key;
}

/**
 * Serialises a value into its canonical form.
 *
 * @param value           the value to serialise
 * @param arrayOrderRules map of root-relative path -> "sorted_by:<key>" | "insertion_ordered"
 * @param path            internal; root-relative path of `value`
 */
export function canonicalise(value, arrayOrderRules = {}, path = '') {
  if (value === null) {
    throw new ContractError(CODES.NULL_FORBIDDEN, 'null is forbidden in canonical input; omit the key instead', { path });
  }
  const t = typeof value;

  if (t === 'boolean') return value ? 'true' : 'false';

  if (t === 'number') {
    if (!Number.isInteger(value)) {
      throw new ContractError(CODES.FLOAT_FORBIDDEN, 'float representation is forbidden; use a fixed decimal string', { path });
    }
    if (!Number.isSafeInteger(value)) {
      throw new ContractError(CODES.INTEGER_OUT_OF_SAFE_RANGE,
        'integer outside the safe range has already lost precision; supply an exact decimal string', { path, value: String(value) });
    }
    const s = String(value);
    if (!PLAIN_INTEGER.test(s)) {
      throw new ContractError(CODES.INTEGER_NOT_PLAIN_DECIMAL, 'integer must serialise as plain decimal without exponent notation', { path, rendered: s });
    }
    return s;
  }

  if (t === 'string') {
    if (looksLikeInstant(value)) {
      const r = inspectInstant(value);
      if (!r.valid) throw new ContractError(r.code, 'value is not a canonical instant', { path, value, ...r.detail });
    }
    if (EXPONENT_DECIMAL_STRING.test(value)) {
      throw new ContractError(CODES.EXPONENT_IN_DECIMAL_STRING, 'exponent notation is forbidden in a fixed decimal string', { path, value });
    }
    return JSON.stringify(value.normalize(CANONICAL.unicodeNormalization));
  }

  if (Array.isArray(value)) {
    const rule = arrayOrderRules[path];
    if (!rule) {
      throw new ContractError(CODES.ARRAY_ORDER_RULE_MISSING,
        'array has no declared order rule; declare sorted_by:<key> or insertion_ordered', { path });
    }
    if (rule.startsWith('sorted_by:')) {
      const key = rule.slice('sorted_by:'.length);
      // every element is validated, not only adjacent pairs: a one element array has no
      // pair to compare, so a pairwise-only check would let a missing sort key through
      const keys = value.map((element, index) => {
        if (element === null || typeof element !== 'object' || Array.isArray(element)) {
          throw new ContractError(CODES.ARRAY_ELEMENT_NOT_OBJECT, 'sorted_by requires object elements', { path, index });
        }
        const k = element[key];
        if (typeof k !== 'string' || k.length === 0) {
          throw new ContractError(CODES.ARRAY_SORT_KEY_MISSING, `sort key "${key}" missing or empty`, { path, index });
        }
        return k.normalize(CANONICAL.unicodeNormalization);
      });
      for (let i = 1; i < keys.length; i++) {
        // compared after normalisation, so two keys that normalise alike cannot both pass
        const d = compareCodePoints(keys[i - 1], keys[i]);
        if (d > 0) throw new ContractError(CODES.ARRAY_NOT_SORTED, `array is not sorted by ${key}`, { path, index: i });
        if (d === 0) {
          throw new ContractError(CODES.ARRAY_SORT_KEY_DUPLICATE,
            `duplicate sort key "${key}" leaves the relative order of those elements undetermined`, { path, index: i });
        }
      }
    } else if (rule !== 'insertion_ordered') {
      throw new ContractError(CODES.ARRAY_ORDER_RULE_UNKNOWN, `unknown array order rule "${rule}"`, { path });
    }
    return `[${value.map((e) => canonicalise(e, arrayOrderRules, `${path}[]`)).join(',')}]`;
  }

  if (t === 'object') {
    // Normalising keys can collapse two distinct keys into one. Silently merging would
    // drop a value, so a collision is an error rather than a resolution.
    const byNormalised = new Map();
    for (const rawKey of Object.keys(value)) {
      const normalised = rawKey.normalize(CANONICAL.unicodeNormalization);
      if (byNormalised.has(normalised)) {
        throw new ContractError(CODES.NFC_KEY_COLLISION,
          'two keys collapse to the same normalised form', { path, first: byNormalised.get(normalised), second: rawKey });
      }
      byNormalised.set(normalised, rawKey);
    }
    const ordered = [...byNormalised.keys()].sort(compareCodePoints);
    const body = ordered.map((normalised) => {
      const rawKey = byNormalised.get(normalised);
      return `${JSON.stringify(normalised)}:${canonicalise(value[rawKey], arrayOrderRules, childPath(path, normalised))}`;
    });
    return `{${body.join(',')}}`;
  }

  throw new ContractError(CODES.UNSUPPORTED_TYPE, `unsupported type ${t}`, { path });
}
