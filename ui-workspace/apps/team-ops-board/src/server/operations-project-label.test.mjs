import test from 'node:test';import assert from 'node:assert/strict';
import {readProjectLabel} from './operations-project-label.mjs';
test('display names require exact project identity and bounded registered store read',()=>{
 const io={read(ref,max){assert.equal(ref,'data_root/20_PROJECTS/P26-001/00_프로젝트_안내/project_identity.json');assert.equal(max,65536);return Buffer.from(JSON.stringify({project_code:'P26-001',approved_fs_key:'P26-001',project_name:'P26-001 합성 과제'}));}};
 assert.equal(readProjectLabel(io,'P26-001'),'합성 과제');assert.equal(readProjectLabel(io,'../../escape'),null);
 for(const value of [{project_code:'P26-002',approved_fs_key:'P26-001',project_name:'wrong'},{project_code:'P26-001',approved_fs_key:'P26-001',project_name:'C:\\private\\file'}])assert.equal(readProjectLabel({read:()=>Buffer.from(JSON.stringify(value))},'P26-001'),null);
});
