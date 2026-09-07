import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDurableToolWorkshop } from './tool_workshop_durable.mjs';
import { pinPptxRunnerBinding, pptxBindingDigest, createPptxWorkshopRunner, PPTX_WORKSHOP_PROFILE } from './pptx_workshop_runner.mjs';
import { directPath, reject, sha256 } from './workshop_files.mjs';
import { syntheticPresentationPacket } from '../../../docs/architecture/workspace/examples/tool_workshop/synthetic_pptx_packet.mjs';

try {
  if(process.argv.length===3 && process.argv[2]==='--help')console.log('node synthetic_pptx_canary.mjs --output-root <empty-directory> --artifact-root <bundled-artifact-tool> --python-executable <bundled-python>');
  else {
    if(process.argv.length!==8 || process.argv[2]!=='--output-root' || process.argv[4]!=='--artifact-root' || process.argv[6]!=='--python-executable')reject('arguments_invalid');
    const root=directPath(process.argv[3],true),artifactRoot=directPath(process.argv[5],true),pythonExecutable=directPath(process.argv[7]);
    const roots=Object.fromEntries(['stateRoot','inputRoot','workRoot','outputRoot','templateRoot'].map(key=>{const dir=path.join(root,key);mkdirSync(dir);return[key,dir];}));
    const templatePath=path.join(roots.templateRoot,'template.pptx');
    const build=spawnSync(process.execPath,[path.join(path.dirname(fileURLToPath(import.meta.url)),'pptx_render_child.mjs'),'template',artifactRoot,templatePath,roots.templateRoot],{windowsHide:true,timeout:90000,encoding:'utf8',env:{SystemRoot:process.env.SystemRoot??'',TEMP:roots.templateRoot,TMP:roots.templateRoot,HOME:roots.templateRoot,USERPROFILE:roots.templateRoot}});
    if(build.status!==0)reject('template_bootstrap_failed');
    const binding=pinPptxRunnerBinding({artifactRoot,pythonExecutable,templatePath,templateApprovalRef:'approval.synthetic_template',templateProvenance:'synthetic_fixture'}),queue=createDurableToolWorkshop({...roots,mode:'create_new'});
    writeFileSync(path.join(root,'runner-binding.json'),JSON.stringify(binding,null,2)+'\n',{flag:'wx'});
    queue.registerWorkshop({...PPTX_WORKSHOP_PROFILE,binding_digest:pptxBindingDigest(binding)});
    const input=Buffer.from(JSON.stringify(syntheticPresentationPacket(binding.template_sha256))),digest=sha256(input);
    writeFileSync(path.join(roots.inputRoot,`${digest}.json`),input,{flag:'wx'});
    queue.submitJob({job_id:'job.synthetic.pptx',workshop_id:'workshop.pptx',project_ref:'project.synthetic',task_ref:'task.synthetic',work_brief_ref:'brief.synthetic',approval_ref:'approval.synthetic',priority:2,required_tool_version:'tool.template_pptx:v1',input_bundle_manifest_digest:digest,timeout_seconds:180,max_retries:0});
    const result=await createPptxWorkshopRunner({...roots,queue,binding,projectRef:'project.synthetic'}).runNext();
    writeFileSync(path.join(root,'candidate-receipt.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
    if(result.state!=='done_candidate')reject('pptx_canary_failed');
    console.log(JSON.stringify(result));
  }
} catch(error){console.error(JSON.stringify({ok:false,code:error.code??'canary_failed'}));process.exitCode=1;}
