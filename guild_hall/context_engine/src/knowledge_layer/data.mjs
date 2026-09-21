// Bounded plain-data boundary shared only by the opt-in knowledge layer.
import { createHash } from 'node:crypto';
import { types } from 'node:util';
export const fail = code => { throw new Error(code); };
export const hashText = text => 'sha256:' + createHash('sha256').update(text, 'utf8').digest('hex');
export const token = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/u.test(value);
export const sha = value => typeof value === 'string' && /^sha256:[0-9a-f]{64}$/u.test(value);
export const keys = (value, names) => value !== null && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).length === names.length && names.every(name => Object.hasOwn(value, name));
export const instant = value => typeof value === 'string' && /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$/u.test(value)
  && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
export function snapshot(value) {
  let nodes = 0, characters = 0;
  const ancestors = new Set();
  function visit(v, depth) {
    if (++nodes > 60000 || depth > 24) fail('knowledge_input_budget');
    if (v === null || typeof v === 'boolean') return v;
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string') { characters += v.length; if (characters > 500000) fail('knowledge_input_budget'); return v; }
    if (typeof v !== 'object' || types.isProxy(v) || ancestors.has(v)) fail('knowledge_plain_data_required');
    if (![Object.prototype, Array.prototype, null].includes(Object.getPrototypeOf(v))) fail('knowledge_plain_data_required');
    const descriptors = Object.getOwnPropertyDescriptors(v);
    if (Reflect.ownKeys(descriptors).some(k => typeof k !== 'string' || !Object.hasOwn(descriptors[k], 'value')
      || (!descriptors[k].enumerable && !(Array.isArray(v) && k === 'length')))) fail('knowledge_plain_data_required');
    ancestors.add(v);
    let out;
    if (Array.isArray(v)) {
      if (Object.keys(v).length !== v.length || Object.keys(v).some((k, i) => k !== String(i))) fail('knowledge_plain_data_required');
      out = v.map(child => visit(child, depth + 1));
    } else {
      out = Object.fromEntries(Object.keys(v).sort().map(k => [k, visit(descriptors[k].value, depth + 1)]));
    }
    ancestors.delete(v); return out;
  }
  return visit(value, 0);
}
export const digest = value => hashText(JSON.stringify(snapshot(value)));
export function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
