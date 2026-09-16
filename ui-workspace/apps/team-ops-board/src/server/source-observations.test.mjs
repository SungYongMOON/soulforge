import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {observationSeries,createSourceObservationsReader} from './source-observations.mjs';
test('partial metadata samples never create zeroes on unobserved days or count unknown mail totals',()=>{
  const s=observationSeries('mail','메일','수집 실행일',[{at:'2026-09-16T00:00:00Z',value:null},{at:'2026-09-15T00:00:00Z',value:0}], '2026-09-16T01:00:00Z','sample');
  assert.equal(s.timeline.daily.at(-1).registrations,null);assert.equal(s.timeline.daily.at(-2).registrations,0);assert.equal(s.timeline.total,0);assert.equal(s.state,'partial');
});
test('source reader projects only metadata, deduplicates Slack messages and rechecks root pin',async t=>{
  const folder=await mkdtemp(path.join(tmpdir(),'source-observations-'));
  t.after(async()=>{assert.equal(path.dirname(path.resolve(folder)),path.resolve(tmpdir()));assert.ok(path.basename(folder).startsWith('source-observations-'));await rm(folder,{recursive:true,force:true});});
  const root=path.join(folder,'data'),dir=path.join(root,'ingress/slack/channels/P24-049/state');await mkdir(dir,{recursive:true});
  const revision={message_ref:'message',channel_id:'channel',message_ts:'1789516800.000000',actor:'must-not-project',body:'must-not-project'};
  await writeFile(path.join(dir,'slack-continuous.json'),JSON.stringify({schema_version:'soulforge.slack_continuous.state.v1',revisions:[revision,revision],cursor:{provider_cursor_token:'must-not-project'}}));
  const bytes=JSON.stringify({schema_version:'soulforge.physical_root_table.v0',roots:{data_root:root}}),tablePath=path.join(folder,'table.json');await writeFile(tablePath,bytes);
  const reader=createSourceObservationsReader({tablePath,expectedSha256:`sha256:${createHash('sha256').update(bytes).digest('hex')}`,projects:['P24-049','P99-999']});
  const value=await reader.read();assert.equal(value.sources.find(s=>s.id==='slack').rows.length,1);assert.equal(value.sources.find(s=>s.id==='linear').state,'unavailable');assert.equal(JSON.stringify(value).includes('must-not-project'),false);assert.equal(JSON.stringify(value).includes(root),false);
  await writeFile(tablePath,'{}');assert.equal((await reader.read()).state,'unavailable');
});
