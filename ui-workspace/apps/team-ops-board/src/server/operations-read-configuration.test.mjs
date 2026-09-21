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

test('mail rule panel settings default unconfigured, allow the scheduled binding, and only "1" enables writes', async t => {
  const root=await mkdtemp(path.join(tmpdir(),'operations-read-config-mail-rule-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  const bindingPath=path.join(root,'read-settings.json');
  const unset=await readOperationsReadConfiguration({bindingPath,env:{}});
  assert.deepEqual(unset.mailRule,{workspacesRoot:undefined,workmetaRoot:undefined,writeEnabled:false,
    hiworksEventsDir:undefined,gmailSentEventsDir:undefined,ledgerOrgConfigPath:undefined,ledgerReceiptsDir:undefined});
  await writeFile(bindingPath,JSON.stringify({TEAM_OPS_WORKSPACES_ROOT:'/from/binding',TEAM_OPS_MAIL_RULE_WRITE:'yes'}));
  const fromBinding=await readOperationsReadConfiguration({bindingPath,env:{}});
  assert.equal(fromBinding.mailRule.workspacesRoot,'/from/binding');
  assert.equal(fromBinding.mailRule.writeEnabled,false,'only the exact string "1" enables writes');
  const fromEnv=await readOperationsReadConfiguration({bindingPath,env:{TEAM_OPS_WORKSPACES_ROOT:'/from/env',TEAM_OPS_WORKMETA_ROOT:'/from/env/meta',TEAM_OPS_MAIL_RULE_WRITE:'1',
    TEAM_OPS_MAIL_HIWORKS_EVENTS_DIR:'/from/env/hiworks',TEAM_OPS_MAIL_GMAIL_SENT_EVENTS_DIR:'/from/env/gmail',
    TEAM_OPS_LEDGER_ORG_CONFIG:'/from/env/org.json',TEAM_OPS_LEDGER_RECEIPTS_DIR:'/from/env/receipts'}});
  assert.equal(fromEnv.mailRule.workspacesRoot,'/from/env','explicit environment overrides the scheduled binding');
  assert.equal(fromEnv.mailRule.workmetaRoot,'/from/env/meta');
  assert.equal(fromEnv.mailRule.writeEnabled,true);
  assert.equal(fromEnv.mailRule.hiworksEventsDir,'/from/env/hiworks');
  assert.equal(fromEnv.mailRule.gmailSentEventsDir,'/from/env/gmail');
  assert.equal(fromEnv.mailRule.ledgerOrgConfigPath,'/from/env/org.json');
  assert.equal(fromEnv.mailRule.ledgerReceiptsDir,'/from/env/receipts');
});
