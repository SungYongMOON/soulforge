import types from 'node:util/types';

import { ContractError } from '../../../core/validators/errors.mjs';

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const MAX_DEPTH = 48;
const MAX_ARRAY_LENGTH = 1_024;
const MAX_OBJECT_KEYS = 256;

function refuse(code, message) {
  throw new ContractError(code, message);
}

function isArrayIndex(key) {
  return /^(?:0|[1-9]\d*)$/u.test(key) && Number(key) < 4_294_967_295;
}

function reflection(call, code, label) {
  try {
    return call();
  } catch {
    refuse(code, `${label} cannot be admitted as plain CMV data`);
  }
}

/**
 * Creates a descriptor-only copy of JSON-like caller input without invoking a
 * user getter.  CMV receives Core-normalized graphs whose repeated references
 * are semantically harmless, so callers can opt out of alias refusal while
 * cycles always remain rejected.
 */
export function snapshotCalibrationMeasurementValidityPlainData(value, {
  code,
  label = 'input',
  rejectAliases = true,
} = {}) {
  if (typeof code !== 'string' || !/^CMV_/u.test(code)) {
    throw new ContractError('CMV_INPUT_UNSAFE', 'CMV safe snapshot requires a declared CMV error code');
  }
  const seen = new WeakSet();
  const active = new WeakSet();

  function copy(input, path, depth) {
    if (depth > MAX_DEPTH) {
      refuse(code, `${path} exceeds the CMV safe depth limit`);
    }
    if (input === null) return null;
    if (typeof input === 'boolean' || typeof input === 'string') return input;
    if (typeof input === 'number') {
      if (!Number.isFinite(input)) refuse(code, `${path} contains a non-finite number`);
      return input;
    }
    if (typeof input !== 'object') {
      refuse(code, `${path} contains a non-JSON primitive`);
    }
    if (reflection(() => types.isProxy(input), code, path)) {
      refuse(code, `${path} must not be a Proxy`);
    }
    if (active.has(input)) {
      refuse(code, `${path} must not contain a cycle`);
    }
    if (rejectAliases && seen.has(input)) {
      refuse(code, `${path} must not contain aliased objects`);
    }
    seen.add(input);
    active.add(input);
    try {
      const array = Array.isArray(input);
      const expectedPrototype = array ? Array.prototype : Object.prototype;
      if (reflection(() => Object.getPrototypeOf(input), code, path) !== expectedPrototype) {
        refuse(code, `${path} must contain only plain objects and arrays`);
      }
      const descriptors = reflection(() => Object.getOwnPropertyDescriptors(input), code, path);
      const keys = Reflect.ownKeys(descriptors);
      if (array) {
        const lengthDescriptor = descriptors.length;
        if (!lengthDescriptor || !Object.hasOwn(lengthDescriptor, 'value')
            || lengthDescriptor.enumerable !== false
            || !Number.isSafeInteger(lengthDescriptor.value)
            || lengthDescriptor.value < 0 || lengthDescriptor.value > MAX_ARRAY_LENGTH) {
          refuse(code, `${path} has an unsafe array length`);
        }
        const length = lengthDescriptor.value;
        if (keys.length !== length + 1) {
          refuse(code, `${path} must not contain sparse or extra array properties`);
        }
        const output = [];
        for (let index = 0; index < length; index += 1) {
          const key = String(index);
          const descriptor = descriptors[key];
          if (!descriptor || !Object.hasOwn(descriptor, 'value') || descriptor.enumerable !== true) {
            refuse(code, `${path} must not contain sparse or accessor array entries`);
          }
          output.push(copy(descriptor.value, `${path}[${index}]`, depth + 1));
        }
        if (keys.some((key) => key !== 'length' && (typeof key !== 'string' || !isArrayIndex(key) || Number(key) >= length))) {
          refuse(code, `${path} has an unsafe array property`);
        }
        return output;
      }
      if (keys.length > MAX_OBJECT_KEYS) {
        refuse(code, `${path} exceeds the CMV safe object-key limit`);
      }
      const output = {};
      for (const key of keys) {
        const descriptor = descriptors[key];
        if (typeof key !== 'string' || FORBIDDEN_KEYS.has(key)
            || !descriptor || !Object.hasOwn(descriptor, 'value') || descriptor.enumerable !== true) {
          refuse(code, `${path} contains a hidden, accessor, symbol, or prototype-sensitive property`);
        }
        output[key] = copy(descriptor.value, `${path}.${key}`, depth + 1);
      }
      return output;
    } finally {
      active.delete(input);
    }
  }

  return copy(value, label, 0);
}
