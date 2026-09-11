// Development-only synthetic input preparation; deliberately absent from lane.
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { materializeT5 } from '../harness/fixtures/context_memory_t5_fixture.mjs';
import { createContextEngineRuntime } from '../src/app.mjs';

const scratch=await mkdtemp(join(tmpdir(),'context-engine-app-slice-'));
const stateParent=join(scratch,'state');await mkdir(stateParent);
// This process only prepares disposable state. Keep the installed child inside
// this same private test temp parent rather than granting it the whole OS temp.
process.env.TEMP=stateParent;process.env.TMP=stateParent;process.env.TMPDIR=stateParent;
const fixture=await materializeT5();
const runtime=createContextEngineRuntime({root:fixture.root,bindingSha256:fixture.bindingSha256,syntheticOnly:true});
const pack=await runtime.contextPack(fixture.request);
if(pack.status!=='PARTIAL'||!pack.facts.length)throw new Error('standalone preparation failed');
const input={scratch,state_parent:stateParent,root:fixture.root,bindingSha256:fixture.bindingSha256,
  request:fixture.request,expected_digest:pack.digest,preparation_effects:fixture.preparation_effects};
await writeFile(join(scratch,'input.json'),JSON.stringify(input,null,2)+'\n');
process.stdout.write(JSON.stringify({scratch,input_ref:join(scratch,'input.json'),expected_digest:pack.digest})+'\n');
