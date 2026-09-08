import fs from 'node:fs';
import path from 'node:path';
import {assertCurrent,contained,exactKeys,readPinnedFile,regularPath,refuse,sha256} from './claude_acp_policy.mjs';
import {buildHwpxSkillCandidate} from './hwpx_skill_author.mjs';
import {createDurableToolWorkshop} from './tool_workshop_durable.mjs';
import {renderHwpxInExistingSession} from './hancom_hwpx_render.mjs';
import {verifyRenderedHwpxPdf,verifyHwpxPdfVerifierBinding} from './hwpx_pdf_verifier.mjs';

const MAX=64*1024*1024;
function metadata(file,limit=128*1024){
  const stat=regularPath(file);if(stat.size>limit)refuse('HWPX_METADATA_LIMIT');
  return JSON.parse(fs.readFileSync(file,'utf8'));
}
function create(file,value){fs.writeFileSync(file,JSON.stringify(value),{flag:'wx',mode:0o600});}
function artifact(file,digest,size,root){
  if(!contained(root,file)||file===root||!Number.isSafeInteger(size)||size<1||size>MAX)refuse('HWPX_ARTIFACT_SCOPE');
  if(readPinnedFile(file,digest,MAX).length!==size)refuse('HWPX_ARTIFACT_CHANGED');
}
function verifyResult(result,binding,operationRoot,runId){
  const {author,native}=binding.hwpxConfiguration;
  exactKeys(result,['state','job_ref','hwpx','pdf','all_page_evidence','render_required','visual_review_required','accepted','official_done']);
  if(result.job_ref!==binding.jobRef||result.accepted!==false||result.official_done!==false||result.visual_review_required!==true)refuse('HWPX_RESULT_INVALID');
  exactKeys(result.hwpx,['artifact_ref','sha256','size_bytes','path']);
  if(result.hwpx.artifact_ref!==`artifact.sha256:${result.hwpx.sha256}`||result.hwpx.path!==path.join(author.output_root,`${result.hwpx.sha256}.hwpx`))refuse('HWPX_ARTIFACT_SCOPE');
  artifact(result.hwpx.path,result.hwpx.sha256,result.hwpx.size_bytes,author.output_root);
  const queue=createDurableToolWorkshop({stateRoot:author.queue_root,mode:'open_existing'}),receipt=queue.getCustodyReceipt(binding.jobRef);
  if(receipt?.artifact?.sha256!==result.hwpx.sha256||receipt.artifact.size_bytes!==result.hwpx.size_bytes||receipt.project_ref!==binding.projectRef)refuse('HWPX_CUSTODY_REQUIRED');
  if(native===null){if(result.state!=='structural_candidate'||result.pdf!==null||result.all_page_evidence!==null||result.render_required!==true)refuse('HWPX_RESULT_INVALID');return;}
  if(result.state!=='rendered_candidate'||result.render_required!==false)refuse('HWPX_RESULT_INVALID');
  exactKeys(result.pdf,['artifact_ref','sha256','size_bytes','path']);
  if(result.pdf.artifact_ref!==`artifact.sha256:${result.pdf.sha256}`)refuse('HWPX_RESULT_INVALID');
  artifact(result.pdf.path,result.pdf.sha256,result.pdf.size_bytes,author.work_root);
  const nativeResult=metadata(path.join(operationRoot,'native-result.json'));
  exactKeys(nativeResult,['pdf_path','pdf_sha256','pdf_size_bytes','hwpx_sha256','cleanup_verified']);
  if(nativeResult.pdf_path!==path.join(native.output_root,`${runId}.pdf`)||nativeResult.pdf_sha256!==result.pdf.sha256
    ||nativeResult.pdf_size_bytes!==result.pdf.size_bytes||nativeResult.hwpx_sha256!==result.hwpx.sha256||nativeResult.cleanup_verified!==true)refuse('HWPX_NATIVE_UNKNOWN');
  artifact(nativeResult.pdf_path,nativeResult.pdf_sha256,nativeResult.pdf_size_bytes,native.output_root);
  const pages=result.all_page_evidence;
  exactKeys(pages,['page_count','page_count_basis','manifest_path','manifest_sha256','images']);
  if(!Number.isInteger(pages.page_count)||pages.page_count<1||pages.page_count>64||!['observed','expected_match'].includes(pages.page_count_basis)
    ||!Array.isArray(pages.images)||pages.images.length!==pages.page_count||!contained(author.work_root,pages.manifest_path))refuse('HWPX_PAGE_EVIDENCE');
  const manifest=JSON.parse(readPinnedFile(pages.manifest_path,pages.manifest_sha256,32768));
  exactKeys(manifest,['page_count','renders']);
  if(manifest.page_count!==pages.page_count||!Array.isArray(manifest.renders)||manifest.renders.length!==pages.page_count)refuse('HWPX_PAGE_EVIDENCE');
  for(const [index,image] of pages.images.entries()){
    exactKeys(image,['path','sha256','size_bytes','width','height']);
    const {path:file,...render}=image;
    if(image.width!==794||image.height!==1123||JSON.stringify(render)!==JSON.stringify(manifest.renders[index]))refuse('HWPX_PAGE_EVIDENCE');
    artifact(file,image.sha256,image.size_bytes,author.work_root);
  }
}

// Fixed code-owned pipeline; the MCP envelope cannot select these ports,
// bindings, native executable, script, model, renderer mode or output roots.
export async function runClaudeHwpxTool({binding,draftPath,draftSha256,jobRef,signal,replayOnly=false}){
  assertCurrent(binding);
  if(binding.version!==2||!binding.tools.includes('hwpx_build_candidate')||jobRef!==binding.jobRef)refuse('TOOL_DENIED');
  if(!contained(binding.jobRoot,draftPath)||draftPath===binding.jobRoot||!/^[a-f0-9]{64}$/.test(draftSha256??''))refuse('HWPX_DRAFT_SCOPE');
  const {author,native,pdf}=binding.hwpxConfiguration;
  // Reject stale PDF runtime/code pins before starting any native session work.
  if(pdf!==null)verifyHwpxPdfVerifierBinding(pdf);
  const operationRoot=path.join(author.work_root,`claude-hwpx-${sha256(jobRef).slice(0,32)}`);
  const intent={version:1,binding_sha256:binding.bindingSha256,job_ref:jobRef,draft_path:draftPath,draft_sha256:draftSha256};
  const intentPath=path.join(operationRoot,'intent.json'),resultPath=path.join(operationRoot,'result.json');
  const runId=`claude-${sha256([binding.bindingSha256,jobRef,draftSha256].join(':')).slice(0,32)}`;
  const controller=new AbortController(),abort=()=>controller.abort();
  signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
  const expires=Math.min(binding.expiresAt,Date.now()+120000),deadline=performance.now()+expires-Date.now();
  function active(){assertCurrent(binding);if(controller.signal.aborted)refuse('HWPX_CANCELLED');if(Date.now()>=expires||performance.now()>=deadline)refuse('HWPX_DEADLINE');}
  let failure=null;
  const timer=setInterval(()=>{try{active();}catch(error){failure=error;controller.abort();}},50);
  try{
    active();
    if(fs.existsSync(operationRoot)){
      regularPath(operationRoot,'directory');
      if(JSON.stringify(metadata(intentPath))!==JSON.stringify(intent))refuse('HWPX_JOB_REUSE_CHANGED');
      if(!fs.existsSync(resultPath))refuse('HWPX_RECOVERY_REQUIRED');
      const result=metadata(resultPath);verifyResult(result,binding,operationRoot,runId);active();return result;
    }
    if(replayOnly)refuse('INPUT_NOT_BOUND');
    const draft=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(readPinnedFile(draftPath,draftSha256,65536)));
    exactKeys(draft,Object.hasOwn(draft,'text_edits')?['text_edits']:['sections','expected_text']);
    active();fs.mkdirSync(operationRoot);create(intentPath,intent);
    const built=await buildHwpxSkillCandidate({configPath:binding.hwpx.author.path,configSha256:binding.hwpx.author.sha256,draftPath,draftSha256,jobRef,assertCurrent:active,signal:controller.signal});
    active();
    const result={state:'structural_candidate',job_ref:jobRef,hwpx:{artifact_ref:built.artifact_ref,sha256:built.sha256,size_bytes:built.size_bytes,path:built.candidate_path},
      pdf:null,all_page_evidence:null,render_required:true,visual_review_required:true,accepted:false,official_done:false};
    if(native!==null){
      active();create(path.join(operationRoot,'native-intent.json'),{run_id:runId,hwpx_sha256:built.sha256});
      const rendered=await renderHwpxInExistingSession({inputPath:built.candidate_path,expectedInputSha256:built.sha256,outputRoot:native.output_root,runId,binding:native,signal:controller.signal,deadline});
      active();artifact(rendered.pdf_path,rendered.pdf_sha256,rendered.pdf_size_bytes,native.output_root);
      if(rendered.cleanup_verified!==true||rendered.input_sha256!==built.sha256)refuse('HWPX_NATIVE_UNKNOWN');
      create(path.join(operationRoot,'native-result.json'),{pdf_path:rendered.pdf_path,pdf_sha256:rendered.pdf_sha256,pdf_size_bytes:rendered.pdf_size_bytes,hwpx_sha256:built.sha256,cleanup_verified:true});
      // This is an MCP operation guard adapted to the verifier's queue-shaped
      // API. It is NOT a SQLite lease, fence, acceptance or Task authority.
      const operation=Object.freeze({operation_ref:`mcp.hwpx:${jobRef}`,expires_at:new Date(expires).toISOString()});
      const guard={assertCurrentLease(value){if(value!==operation)refuse('HWPX_OPERATION_GUARD');active();}};
      const checked=await verifyRenderedHwpxPdf({pdfPath:rendered.pdf_path,pdfSha256:rendered.pdf_sha256,hwpxSha256:built.sha256,expectedText:built.expected_text.filter(text=>text.trim().length>0),
        runRoot:operationRoot,binding:pdf,queue:guard,lease:operation,deadline});
      active();
      if(checked.hwpx_sha256!==built.sha256||checked.pdf_sha256!==rendered.pdf_sha256||checked.visual_review_required!==true)refuse('HWPX_PAGE_EVIDENCE');
      result.state='rendered_candidate';result.render_required=false;
      result.pdf={artifact_ref:`artifact.sha256:${checked.pdf_sha256}`,sha256:checked.pdf_sha256,size_bytes:checked.pdf_size_bytes,path:checked.pdf_path};
      result.all_page_evidence={page_count:checked.page_count,page_count_basis:checked.page_count_basis,manifest_path:checked.render_manifest_path,
        manifest_sha256:checked.render_manifest_sha256,images:checked.image_paths.map((file,index)=>({path:file,...checked.renders[index]}))};
    }
    verifyResult(result,binding,operationRoot,runId);active();create(resultPath,result);active();return result;
  }catch(error){throw failure??error;}
  finally{clearInterval(timer);signal?.removeEventListener('abort',abort);}
}
