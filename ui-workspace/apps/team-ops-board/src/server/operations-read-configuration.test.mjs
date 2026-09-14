import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { readOperationsReadConfiguration } from './operations-read-configuration.mjs';

test('scheduled UI settings are optional, allowlisted and subordinate to explicit environment', async t => {
  const root=await mkdtemp(path.join(tmpdir(),'operations-read-config-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  const bindingPath=path.join(root,'read-settings.json');
  assert.deepEqual((await readOperationsReadConfiguration({bindingPath,env:{}})).graph.projects,[]);
  await writeFile(bindingPath,JSON.stringify({TEAM_OPS_GRAPH_PROJECTS:'P00-001',TEAM_OPS_RESPONSE_AGENT_LABEL:'Synthetic agent'}));
  const result=await readOperationsReadConfiguration({bindingPath,env:{TEAM_OPS_GRAPH_PROJECTS:'P00-002'}});
  assert.deepEqual(result.graph.projects,['P00-002']);
  assert.equal(result.graph.responseAgentLabel,'Synthetic agent');
  await writeFile(bindingPath,JSON.stringify({ENABLE_WRITER:'1'}));
  await assert.rejects(readOperationsReadConfiguration({bindingPath,env:{}}),/operations_read_configuration_invalid/);
  await writeFile(bindingPath,'{broken');
  await assert.rejects(readOperationsReadConfiguration({bindingPath,env:{TEAM_OPS_GRAPH_PROJECTS:'P00-002'}}),/operations_read_configuration_invalid/);
});
