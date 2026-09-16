import {createHash} from 'node:crypto';
const sha=/^sha256:[a-f0-9]{64}$/u;
export function sourceLinkKey(source,identity,revision){
  if(!['linear','slack'].includes(source)||typeof identity!=='string'||!identity||typeof revision!=='string'||!revision)return null;
  return createHash('sha256').update(JSON.stringify([source,identity,revision])).digest('hex');
}
export function projectRagSourceLink(doc){
  if(doc?.schema_version!=='soulforge.context_source_document.v1')return null;
  if(doc.source_kind==='linear'&&sha.test(doc.primary_revision_sha256??''))return sourceLinkKey('linear',doc.item_id,doc.primary_revision_sha256);
  if(doc.source_kind==='slack'){
    const channel=doc.facts?.find(f=>f.name==='slack.channel_id')?.value;
    const locator=doc.units?.map(u=>u.locator).find(l=>l?.message_ts===doc.item_id&&l.channel_id===channel&&typeof l.revision_ref==='string');
    if(channel&&locator)return sourceLinkKey('slack',`${channel}:${doc.item_id}`,locator.revision_ref);
  }
  return null;
}
