import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDurableToolWorkshop } from './tool_workshop_durable.mjs';
import { pinPptxRunnerBinding, pptxBindingDigest, createPptxWorkshopRunner, PPTX_WORKSHOP_PROFILE, validateTextProfile, validatePresentationPacket } from './pptx_workshop_runner.mjs';
import { directPath, reject, sha256 } from './workshop_files.mjs';
import { syntheticPresentationPacket } from '../../../docs/architecture/workspace/examples/tool_workshop/synthetic_pptx_packet.mjs';

try {
  if(process.argv.length===3 && process.argv[2]==='--help')console.log('node synthetic_pptx_canary.mjs --output-root <empty-directory> --artifact-root <bundled-artifact-tool> --python-executable <bundled-python> [--korean-text]');
  else {
    const korean=process.argv.length===9 && process.argv[8]==='--korean-text';
    if((process.argv.length!==8 && !korean) || process.argv[2]!=='--output-root' || process.argv[4]!=='--artifact-root' || process.argv[6]!=='--python-executable')reject('arguments_invalid');
    const root=directPath(process.argv[3],true),artifactRoot=directPath(process.argv[5],true),pythonExecutable=directPath(process.argv[7]);
    const roots=Object.fromEntries(['stateRoot','inputRoot','workRoot','outputRoot','templateRoot'].map(key=>{const dir=path.join(root,key);mkdirSync(dir);return[key,dir];}));
    const templatePath=path.join(roots.templateRoot,'template.pptx');
    const textProfile=korean?validateTextProfile({family:'workshop.approved_text',revision:'template:korean1',slides:[2,3,4,3].map((count,index)=>({textboxes:Array.from({length:count},(_,box)=>({placeholder:`{{TEXT_${index+1}_${box+1}}}`,geometry:box===0?[72,48,1136,88]:count===2?[72,180,1136,400]:[72,180+(box-1)*145,1136,128],font_family:'Malgun Gothic',font_size:box===0?44:32}))}))}):undefined;
    const profilePath=path.join(root,'text-profile.json');
    if(textProfile)writeFileSync(profilePath,JSON.stringify(textProfile,null,2)+'\n',{flag:'wx'});
    const build=spawnSync(process.execPath,[path.join(path.dirname(fileURLToPath(import.meta.url)),'pptx_render_child.mjs'),korean?'template-text':'template',artifactRoot,templatePath,roots.templateRoot,...(korean?[profilePath]:[])],{windowsHide:true,timeout:90000,encoding:'utf8',env:{SystemRoot:process.env.SystemRoot??'',TEMP:roots.templateRoot,TMP:roots.templateRoot,HOME:roots.templateRoot,USERPROFILE:roots.templateRoot}});
    if(build.status!==0)reject('template_bootstrap_failed');
    const binding=pinPptxRunnerBinding({artifactRoot,pythonExecutable,templatePath,templateApprovalRef:'approval.synthetic_template',templateProvenance:'synthetic_fixture',textProfile}),queue=createDurableToolWorkshop({...roots,mode:'create_new'});
    writeFileSync(path.join(root,'runner-binding.json'),JSON.stringify(binding,null,2)+'\n',{flag:'wx'});
    queue.registerWorkshop({...PPTX_WORKSHOP_PROFILE,binding_digest:pptxBindingDigest(binding)});
    const packet=syntheticPresentationPacket(binding.template_sha256);
    if(korean)packet.slides=[
      {texts:['합성 장비 검토 개요','검토 대상은 가상의 장비입니다.\n시험 조건과 판정을 구분합니다.\n이 자료에는 실과제 정보가 없습니다.']},
      {texts:['시험 조건과 측정 결과','전원 조건: 24 V ± 5%\n측정 온도: 25 ℃','합성 결과: 12.5 ms\n허용 기준: 15.0 ms 이하']},
      {texts:['변경 전후 비교','변경 전: 응답 시간 18.0 ms','변경 후: 응답 시간 12.5 ms','차이: 5.5 ms 감소\n실제 성능 검증을 뜻하지 않습니다.']},
      {texts:['검토 범위와 후속 확인','문서 후보의 텍스트를 확인했습니다.\n업무 결과의 수락은 포함하지 않습니다.','다음 확인: 담당자 검토\n합성 식별자: TEST-2026-09']}
    ];
    validatePresentationPacket(packet,textProfile);
    const input=Buffer.from(JSON.stringify(packet)),digest=sha256(input);
    writeFileSync(path.join(roots.inputRoot,`${digest}.json`),input,{flag:'wx'});
    queue.submitJob({job_id:'job.synthetic.pptx',workshop_id:'workshop.pptx',project_ref:'project.synthetic',task_ref:'task.synthetic',work_brief_ref:'brief.synthetic',approval_ref:'approval.synthetic',priority:2,required_tool_version:'tool.template_pptx:v1',input_bundle_manifest_digest:digest,timeout_seconds:180,max_retries:0});
    const result=await createPptxWorkshopRunner({...roots,queue,binding,projectRef:'project.synthetic'}).runNext();
    writeFileSync(path.join(root,'candidate-receipt.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
    if(result.state!=='done_candidate')reject('pptx_canary_failed');
    console.log(JSON.stringify(result));
  }
} catch(error){console.error(JSON.stringify({ok:false,code:error.code??'canary_failed'}));process.exitCode=1;}
