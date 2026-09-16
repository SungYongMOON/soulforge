import test from 'node:test';import assert from 'node:assert/strict';
import {projectRagSourceLink,sourceLinkKey} from './rag-source-link.mjs';
test('links require matching source kind, channel scope and immutable primary revision',()=>{
 const revision=`sha256:${'a'.repeat(64)}`,base={schema_version:'soulforge.context_source_document.v1',source_kind:'linear',item_id:'synthetic',primary_revision_sha256:revision};
 assert.equal(projectRagSourceLink(base),sourceLinkKey('linear','synthetic',revision));assert.notEqual(projectRagSourceLink(base),sourceLinkKey('linear','synthetic',`sha256:${'b'.repeat(64)}`));
 const slack={...base,source_kind:'slack',item_id:'123.456789',facts:[{name:'slack.channel_id',value:'C-SYNTHETIC'}],units:[{locator:{channel_id:'C-SYNTHETIC',message_ts:'123.456789',revision_ref:'revision-1'}}]};
 assert.equal(projectRagSourceLink(slack),sourceLinkKey('slack','C-SYNTHETIC:123.456789','revision-1'));slack.units[0].locator.channel_id='other';assert.equal(projectRagSourceLink(slack),null);
 assert.equal(projectRagSourceLink({...base,source_kind:'mail'}),null);
});
