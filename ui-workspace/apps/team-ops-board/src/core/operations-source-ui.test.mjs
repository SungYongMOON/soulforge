import test from 'node:test';import assert from 'node:assert/strict';
import {buildSync} from 'esbuild';import {createRequire} from 'node:module';import {fileURLToPath} from 'node:url';
import {createElement as h} from 'react';import {renderToStaticMarkup} from 'react-dom/server';
const source=fileURLToPath(new URL('../operations-source-ui.tsx',import.meta.url));
const built=buildSync({entryPoints:[source],bundle:true,write:false,platform:'node',format:'cjs',jsx:'automatic',loader:{'.css':'empty'},external:['react','react/jsx-runtime']});
const mod={exports:{}};Function('require','module','exports',built.outputFiles[0].text)(createRequire(import.meta.url),mod,mod.exports);
const {SourceStateContext,SourceBoundary,SourceFailures}=mod.exports;
const render=(sources,child)=>renderToStaticMarkup(h(SourceStateContext.Provider,{value:{sources,retry:()=>{}}},child));
test('first-load HTML masks supplied intermediate numeric verdicts until dependencies settle',()=>{
  const html=render({health:{status:'success',value:{count:4}},rag:{status:'loading'}},h(SourceBoundary,{keys:['health','rag'],label:'운영 상태'},h('div',null,'수집기 4/5 · 진단 3건')));
  assert.match(html,/조회 중/);assert.doesNotMatch(html,/수집기 4\/5|진단 3건|정상/);
});
test('failed source HTML keeps known values with retained timestamp and actionable error context',()=>{
  const row={status:'error',value:{count:5},lastSuccessAt:'2026-09-17T12:00:00Z',failedAt:'2026-09-17T12:01:00Z',error:{code:'HTTP_503'}};
  const html=render({rag:row},h('div',null,h(SourceFailures),h(SourceBoundary,{keys:['rag'],label:'검색 준비'},h('b',null,'5개 문서'))));
  for(const pattern of [/5개 문서/,/마지막 정상값/,/마지막 확인/,/영향받는 화면/,/검색 DB 처리/,/다시 시도/,/HTTP_503/])assert.match(html,pattern);
  assert.doesNotMatch(html,/<details[^>]*\bopen\b/);
});
test('a failed-source retry remains explained while loading and clears only after success',()=>{
  const row={status:'loading',value:{},lastSuccessAt:'2026-09-17T12:00:00Z',failedAt:'2026-09-17T12:01:00Z',error:{code:'HTTP_503'}};
  assert.match(render({rag:row},h(SourceFailures)),/재시도 중/);
  assert.equal(render({rag:{...row,status:'success',error:null}},h(SourceFailures)),'');
});
