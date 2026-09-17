import test from 'node:test';import assert from 'node:assert/strict';
import {formatAmount,formatExact,displayModelName} from './operations-format.mjs';
test('operational numbers share Korean summaries, exact values and unknown semantics',()=>{
  assert.equal(formatAmount(3157298006),'31.6억');assert.equal(formatExact(3157298006),'3,157,298,006');
  assert.equal(formatAmount(450000000),'4.5억');assert.equal(formatAmount(0),'0');
  for(const value of [null,undefined,NaN,Infinity,'0'])assert.equal(formatAmount(value),'—');
  assert.notEqual(formatAmount(.0012),'0');assert.equal(displayModelName('unassigned'),'미분류');
});
