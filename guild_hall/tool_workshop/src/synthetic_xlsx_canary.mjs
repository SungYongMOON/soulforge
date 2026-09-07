#!/usr/bin/env node
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { createDurableToolWorkshop } from './tool_workshop_durable.mjs';
import { createXlsxWorkshopRunner, pinXlsxRunnerBinding, xlsxBindingDigest, XLSX_WORKSHOP_PROFILE } from './xlsx_workshop_runner.mjs';
import { directPath, reject, sha256 } from './workshop_files.mjs';
import { syntheticXlsxPacket } from '../../../docs/architecture/workspace/examples/tool_workshop/synthetic_xlsx_packet.mjs';

try {
  if(process.argv.length===3 && process.argv[2]==='--help') {
    console.log('node guild_hall/tool_workshop/src/synthetic_xlsx_canary.mjs --output-root <absolute-existing-empty-directory>');
  } else {
    if(process.argv.length!==4 || process.argv[2]!=='--output-root') reject('arguments_invalid');
    const root=directPath(process.argv[3],true);
    const roots=Object.fromEntries(['stateRoot','inputRoot','workRoot','outputRoot'].map(key=>{const dir=path.join(root,key);if(existsSync(dir))reject('canary_target_exists');mkdirSync(dir);return[key,dir];}));
    const binding=pinXlsxRunnerBinding(),queue=createDurableToolWorkshop(roots);
    writeFileSync(path.join(root,'runner-binding.json'),JSON.stringify(binding,null,2)+'\n',{flag:'wx'});
    queue.registerWorkshop({...XLSX_WORKSHOP_PROFILE,binding_digest:xlsxBindingDigest(binding)});
    const input=Buffer.from(JSON.stringify(syntheticXlsxPacket())),digest=sha256(input);
    writeFileSync(path.join(roots.inputRoot,`${digest}.json`),input,{flag:'wx'});
    queue.submitJob({job_id:'job.synthetic.xlsx',workshop_id:'workshop.xlsx',project_ref:'project.synthetic',task_ref:'task.synthetic',work_brief_ref:'brief.synthetic',approval_ref:'approval.synthetic',priority:2,required_tool_version:binding.tool_version,input_bundle_manifest_digest:digest,timeout_seconds:30,max_retries:0});
    const result=await createXlsxWorkshopRunner({...roots,binding,queue,projectRef:'project.synthetic'}).runNext();
    if(result.state!=='done_candidate')reject('canary_failed');
    writeFileSync(path.join(root,'candidate-receipt.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
    console.log(JSON.stringify(result));
  }
} catch(error) {console.error(JSON.stringify({ok:false,code:error.code??'canary_failed'}));process.exitCode=1;}
