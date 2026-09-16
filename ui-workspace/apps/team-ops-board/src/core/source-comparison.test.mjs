import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceComparison} from './source-comparison.mjs';
test('source calendars align to the latest supplied day without filling unobserved dates',()=>{
  const view=sourceComparison([{id:'plaud',state:'ready',timeline:{end:'2026-09-15',daily:[{date:'2026-09-15',registrations:82}]}},{id:'mail',state:'partial',timeline:{end:'2026-09-16',daily:[{date:'2026-09-16',registrations:0,partial:true}]}}]);
  assert.equal(view.days.length,14);assert.equal(view.start,'2026-09-03');assert.equal(view.rows[0].daily.at(-1).value,null);assert.equal(view.rows[1].daily.at(-1).value,0);assert.equal(view.rows[1].total,0);assert.equal(view.rows[0].total,82);assert.equal(view.rows[0].partial,true);assert.equal('total' in view,false);
});
test('summary counts use only aligned dates and preserve unavailable as unknown',()=>{
  const view=sourceComparison([{id:'slack',state:'partial',timeline:{end:'2026-09-16',daily:[{date:'2026-09-01',registrations:20},{date:'2026-09-15',registrations:3},{date:'2026-09-16',registrations:null}]}},{id:'docs',state:'unavailable',timeline:{end:'2026-09-16',daily:[{date:'2026-09-16',registrations:9}]}}]);
  assert.equal(view.rows[0].total,3);assert.equal(view.rows[1].total,null);assert.equal(view.rows[1].unit,'문서');assert.deepEqual(sourceComparison([]).days,[]);
});
