import { types } from 'node:util';

import { ContractError } from '../../../core/validators/errors.mjs';
import { TIME_PRECISION } from '../../../core/validators/contract_config.mjs';

const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const UTC_INSTANT = new RegExp(
  `^(\\d{4})-(\\d{2})-(\\d{2})T(\\d{2}):(\\d{2}):(\\d{2})\\.(\\d{${TIME_PRECISION.fractionalDigits}})Z$`,
  'u',
);

function refuse(code, label, detail) {
  throw new ContractError(code, `${label} ${detail}`);
}

/**
 * Copies only bounded, ordinary data without invoking user-defined getters or
 * Proxy traps. Cycles are refused; non-cyclic aliases are copied into separate
 * immutable-output candidates so a caller cannot retain a mutable alias.
 */
export function snapshotPublicData(value, {
  code,
  label = 'input',
  maxDepth = 16,
  maxArrayLength = 128,
  maxStringLength = 512,
  forbiddenKeys = new Set(),
  validateString = null,
} = {}) {
  const ancestors = new WeakSet();

  function copy(current, depth) {
    if (depth > maxDepth) refuse(code, label, 'exceeds the maximum nesting depth');
    if (current === null || typeof current === 'boolean') return current;
    if (typeof current === 'number') {
      if (!Number.isSafeInteger(current)) refuse(code, label, 'contains a non-safe integer');
      return current;
    }
    if (typeof current === 'string') {
      if (!current || current.length > maxStringLength || current.normalize('NFC') !== current
          || /[\u0000-\u001f\u007f]/u.test(current)
          || (validateString && !validateString(current))) {
        refuse(code, label, 'contains an unsafe or unbounded string');
      }
      return current;
    }
    if (!current || typeof current !== 'object') refuse(code, label, 'must contain only plain data');
    if (types.isProxy(current)) refuse(code, label, 'must not be a Proxy');
    if (ancestors.has(current)) refuse(code, label, 'must not contain a cycle');
    ancestors.add(current);
    try {
      if (Array.isArray(current)) {
        if (Object.getPrototypeOf(current) !== Array.prototype) {
          refuse(code, label, 'arrays must use Array.prototype');
        }
        const descriptors = Object.getOwnPropertyDescriptors(current);
        const keys = Reflect.ownKeys(descriptors);
        const lengthDescriptor = descriptors.length;
        if (!lengthDescriptor || !Object.hasOwn(lengthDescriptor, 'value')
            || !Number.isSafeInteger(lengthDescriptor.value)
            || lengthDescriptor.value > maxArrayLength
            || keys.length !== lengthDescriptor.value + 1) {
          refuse(code, label, 'arrays must be bounded, dense, and have no extra fields');
        }
        const out = [];
        for (let index = 0; index < lengthDescriptor.value; index += 1) {
          const key = String(index);
          const descriptor = descriptors[key];
          if (!descriptor || !Object.hasOwn(descriptor, 'value') || descriptor.enumerable !== true) {
            refuse(code, label, 'arrays may not contain holes, accessors, or hidden entries');
          }
          out.push(copy(descriptor.value, depth + 1));
        }
        return out;
      }

      if (Object.getPrototypeOf(current) !== Object.prototype) {
        refuse(code, label, 'objects must use Object.prototype');
      }
      const descriptors = Object.getOwnPropertyDescriptors(current);
      const out = {};
      for (const key of Reflect.ownKeys(descriptors)) {
        const descriptor = descriptors[key];
        if (typeof key !== 'string' || UNSAFE_KEYS.has(key) || forbiddenKeys.has(key)
            || !Object.hasOwn(descriptor, 'value') || descriptor.enumerable !== true) {
          refuse(code, label, 'may not contain symbols, accessors, hidden fields, or unsafe keys');
        }
        out[key] = copy(descriptor.value, depth + 1);
      }
      return out;
    } finally {
      ancestors.delete(current);
    }
  }

  return copy(value, 0);
}

export function deepFreezePublicData(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreezePublicData(child);
    Object.freeze(value);
  }
  return value;
}

function isLeapYear(year) {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function daysInMonth(year, month) {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

/**
 * Accepts the Core-compatible UTC spelling only when its calendar and clock
 * components describe a real instant with the exact configured fractional digits.
 */
export function parseCanonicalUtcInstant(value) {
  if (typeof value !== 'string') return null;
  const match = UTC_INSTANT.exec(value);
  if (!match) return null;
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, fractional] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)
      || hour > 23 || minute > 59 || second > 59) {
    return null;
  }
  return { year, month, day, hour, minute, second, fractional };
}

export function compareCanonicalUtcInstants(left, right) {
  for (const field of ['year', 'month', 'day', 'hour', 'minute', 'second']) {
    if (left[field] !== right[field]) return left[field] < right[field] ? -1 : 1;
  }
  if (left.fractional === right.fractional) return 0;
  return left.fractional < right.fractional ? -1 : 1;
}
