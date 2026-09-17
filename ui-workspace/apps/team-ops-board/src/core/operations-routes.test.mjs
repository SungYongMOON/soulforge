import test from 'node:test';import assert from 'node:assert/strict';
import {parseConsoleRoute,consoleRouteUrl} from './operations-routes.mjs';
test('all public hashes and legacy bookmarks restore the same internal screen',()=>{
  for(const [hash,screen] of Object.entries({overview:'overview',diagnostics:'system',data:'directory',usage:'usage',rag:'rag',search:'evidence',memory:'memory',system:'system',directory:'directory',evidence:'evidence'}))assert.equal(parseConsoleRoute('#'+hash).screen,screen);
  assert.equal(parseConsoleRoute('#unknown').screen,'overview');
});
test('route serialization carries exact project and normalizes old names',()=>{
  assert.equal(consoleRouteUrl({screen:'system'}),'#diagnostics');
  assert.deepEqual(parseConsoleRoute('#rag','?project=P00-001'),{screen:'rag',node:null,project:'P00-001'});
  assert.equal(consoleRouteUrl({screen:'rag',project:'P00-001'}),'?project=P00-001#rag');
});
