// Local document/job bookkeeping for a trusted fixed entrypoint. These methods
// are host ports, not model tools: a chat payload cannot install a catalog,
// register an attachment, mint a binding, or attest child-process termination.
import {randomUUID} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {existsSync,mkdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {boundedRead,directPath,disjointRoots,exactKeys,reject,sha256} from './workshop_files.mjs';
import {loadBinding,safeRef,validateWorkspaceRelativePath} from './claude_acp_policy.mjs';
import {createDurableToolWorkshop} from './tool_workshop_durable.mjs';
import {verifyHwpxReferenceBinding,hwpxReferenceBindingDigest} from './hwpx_reference_runner.mjs';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const REF=/^[a-z][a-z0-9_.:-]{1,120}$/,HASH=/^[a-f0-9]{64}$/;
const ACTIVE=['EXECUTION_UNKNOWN','CANCEL_REQUESTED'];
const BLOCKING=['PREPARING','READY',...ACTIVE];
const MAX=64*1024*1024;
function exact(value,keys){exactKeys(value,keys);if(Object.keys(value).length!==keys.length)reject('jobs_shape_invalid');}
function reference(value){if(typeof value!=='string'||!REF.test(value))reject('jobs_ref_invalid');return value;}
function pinned(pin,max=2*1024*1024){exact(pin,['path','sha256']);if(!HASH.test(pin.sha256??''))reject('jobs_pin_invalid');const bytes=boundedRead(pin.path,max);if(sha256(bytes)!==pin.sha256)reject('jobs_pin_changed');return bytes;}
function json(pin,max){return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(pinned(pin,max)));}
function put(file,value){const bytes=Buffer.isBuffer(value)?value:Buffer.from(JSON.stringify(value));writeFileSync(file,bytes,{flag:'wx',mode:0o600});return {path:file,sha256:sha256(bytes)};}
function inside(root,file){const relative=path.relative(root,path.resolve(file));return relative!==''&&!path.isAbsolute(relative)&&relative!=='..'&&!relative.startsWith(`..${path.sep}`);}
function rootPath(value){const root=directPath(value,true);if(/(?:^|[\\/])(?:_workmeta|_workspaces|private-state|install|source-lanes)(?:[\\/]|$)/i.test(root))reject('jobs_root_forbidden');return root;}

export function openHwpxWorkshopJobs({configPath,configSha256,mode='open_existing'}) {
  const configPin={path:configPath,sha256:configSha256},config=json(configPin);
  exact(config,['version','work_root','common_root','observed_input_root','model','bot_ref','role_ref','allow_new_jobs','issuance_approval_ref','issuance_expires_at','job_lifetime_ms','reference_catalog']);
  if(config.version!==1||config.allow_new_jobs!==true||!Number.isSafeInteger(config.issuance_expires_at)||!Number.isSafeInteger(config.job_lifetime_ms)||config.job_lifetime_ms<60000||config.job_lifetime_ms>4*3600000)reject('jobs_issuance_invalid');
  for(const field of ['model','bot_ref','role_ref'])safeRef(config[field]);reference(config.issuance_approval_ref);
  const work=rootPath(config.work_root),common=rootPath(config.common_root),incoming=rootPath(config.observed_input_root);
  disjointRoots([work,common,ROOT]);
  if(!inside(common,incoming)||inside(work,configPath))reject('jobs_authority_location');
  if(!Array.isArray(config.reference_catalog)||config.reference_catalog.length<1||config.reference_catalog.length>64)reject('jobs_catalog_invalid');
  const catalog=new Map();
  for(const entry of config.reference_catalog){exact(entry,['reference_ref','seed_binding']);reference(entry.reference_ref);if(catalog.has(entry.reference_ref))reject('jobs_catalog_invalid');pinned(entry.seed_binding,32768);catalog.set(entry.reference_ref,entry);}
  const roots=Object.fromEntries(['manager','observed','jobs','queues','sealed'].map(name=>[name,path.join(common,name)]));
  for(const root of Object.values(roots))if(root===incoming||inside(root,incoming)||inside(incoming,root)||inside(root,configPath))reject('jobs_authority_location');
  if(!['create_new','open_existing'].includes(mode))reject('jobs_open_mode');
  if(mode==='create_new'){for(const root of Object.values(roots))mkdirSync(root);}else{for(const root of Object.values(roots))rootPath(root);}
  const jobsRoot=path.join(work,'JOBS');rootPath(jobsRoot);
  const dbPath=path.join(roots.manager,'jobs.sqlite'),markerPath=path.join(roots.manager,'initialized.json');
  if(mode==='create_new'&&(existsSync(dbPath)||existsSync(markerPath)))reject('jobs_state_exists');
  if(mode==='open_existing'&&(!existsSync(dbPath)||!existsSync(markerPath)))reject('jobs_state_missing');
  if(mode==='open_existing')directPath(dbPath);
  const db=new DatabaseSync(dbPath);
  let closed=false;
  db.exec('PRAGMA journal_mode=DELETE;PRAGMA synchronous=FULL;PRAGMA busy_timeout=1000');
  if(mode==='create_new'){
    db.exec(`CREATE TABLE manager_binding(id INTEGER PRIMARY KEY CHECK(id=1),digest TEXT NOT NULL);
      CREATE TABLE documents(document_ref TEXT PRIMARY KEY,reference_ref TEXT NOT NULL,title TEXT NOT NULL,created_at INTEGER NOT NULL);
      CREATE TABLE observed_inputs(input_ref TEXT PRIMARY KEY,document_ref TEXT NOT NULL,source_relative TEXT NOT NULL,sha256 TEXT NOT NULL,size_bytes INTEGER NOT NULL,text_eligible INTEGER NOT NULL,sealed_name TEXT NOT NULL);
      CREATE TABLE jobs(job_ref TEXT PRIMARY KEY,document_ref TEXT NOT NULL,revision INTEGER NOT NULL,state TEXT NOT NULL,issued_at INTEGER NOT NULL,expires_at INTEGER NOT NULL,binding_path TEXT,binding_sha256 TEXT,execution_ref TEXT,result_sha256 TEXT,UNIQUE(document_ref,revision));`);
    db.prepare('INSERT INTO manager_binding VALUES(1,?)').run(configSha256);put(markerPath,{config_sha256:configSha256});
  }
  const tokens=new WeakMap();
  function current(){
    if(closed)reject('jobs_closed');pinned(configPin);rootPath(work);rootPath(common);rootPath(incoming);directPath(dbPath);
    if(JSON.parse(boundedRead(markerPath,4096)).config_sha256!==configSha256||db.prepare('SELECT digest FROM manager_binding WHERE id=1').get()?.digest!==configSha256)reject('jobs_state_binding_changed');
  }
  function transaction(action){current();db.exec('BEGIN IMMEDIATE');try{const value=action();db.exec('COMMIT');return value;}catch(error){db.exec('ROLLBACK');throw error;}}
  function document(id){reference(id);const row=db.prepare('SELECT * FROM documents WHERE document_ref=?').get(id);if(!row)reject('jobs_document_unknown');return row;}
  function job(id){reference(id);const row=db.prepare('SELECT * FROM jobs WHERE job_ref=?').get(id);if(!row)reject('jobs_job_unknown');return row;}
  function entryFor(ref){const entry=catalog.get(ref);if(!entry)reject('jobs_reference_unapproved');const seed=json(entry.seed_binding,32768);
    if(seed.version!==2||seed.model!==config.model||seed.botRef!==config.bot_ref||seed.roleRef!==config.role_ref)reject('jobs_seed_scope');
    for(const descriptor of [entry.seed_binding,seed.hwpx?.author,seed.hwpx?.native,seed.hwpx?.pdf,seed.instructions,...(seed.skills??[])].filter(Boolean)){
      if(inside(work,descriptor.path)||inside(incoming,descriptor.path)||Object.values(roots).some(root=>inside(root,descriptor.path)))reject('jobs_authority_location');
    }
    const author=json(seed.hwpx.author),referenceBinding=json(author.reference_binding);
    if(inside(work,referenceBinding.template_path)||inside(incoming,referenceBinding.template_path))reject('jobs_authority_location');
    verifyHwpxReferenceBinding(referenceBinding);return {seed,author,referenceBinding};
  }
  function execution(token){current();const ref=tokens.get(token);if(!ref)reject('jobs_observer_token_required');const row=job(ref.job_ref);
    if(row.execution_ref!==ref.execution_ref||!ACTIVE.includes(row.state))reject('jobs_execution_not_active');return row;}
  function jobView(row){return {...row,binding:row.binding_path?{path:row.binding_path,sha256:row.binding_sha256}:null,launch_allowed:row.state==='READY'&&row.expires_at>Date.now(),recovery_required:['PREPARING',...ACTIVE].includes(row.state),accepted:false,official_done:false};}
  function readResult(row){
    if(!row.result_sha256)return null;
    const base=path.join(roots.sealed,row.job_ref),manifest=json({path:path.join(base,'manifest.json'),sha256:row.result_sha256},32768);
    exact(manifest,['job_ref','document_ref','revision','source_result_sha256','state','render_required','visual_review_required','accepted','official_done','artifacts']);
    if(manifest.job_ref!==row.job_ref||manifest.document_ref!==row.document_ref||manifest.revision!==row.revision||manifest.accepted!==false||manifest.official_done!==false||!Array.isArray(manifest.artifacts)||manifest.artifacts.length<1||manifest.artifacts.length>67)reject('jobs_result_invalid');
    for(const item of manifest.artifacts){exact(item,['name','sha256','size_bytes']);if(!/^(?:document\.hwpx|document\.pdf|pages\.json|page-[1-9][0-9]*\.png)$/.test(item.name))reject('jobs_result_invalid');if(pinned({path:path.join(base,item.name),sha256:item.sha256},MAX).length!==item.size_bytes)reject('jobs_result_changed');}
    return {...manifest,artifacts:manifest.artifacts.map(item=>({...item,path:path.join(base,item.name)}))};
  }
  current();
  return Object.freeze({
    registerObservedInput(request){
      exact(request,['documentRef','inputRef','relativePath','sha256']);const {documentRef,inputRef,relativePath,sha256:expected}=request;
      reference(inputRef);current();document(documentRef);
      if(typeof relativePath!=='string'||relativePath.includes('\\')||!relativePath.split('/').every(part=>/^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$/.test(part)&&part!=='.'&&part!=='..')||!HASH.test(expected??''))reject('jobs_observation_invalid');
      const file=path.resolve(incoming,relativePath);if(!inside(incoming,file))reject('jobs_observation_invalid');
      const bytes=pinned({path:file,sha256:expected},32*1024*1024),extension=path.extname(relativePath).toLowerCase();
      if(!['.json','.md','.txt','.hwpx','.pdf'].includes(extension))reject('jobs_observation_type');
      const textEligible=['.json','.md','.txt'].includes(extension)&&bytes.length<=65536;
      if(textEligible)new TextDecoder('utf-8',{fatal:true}).decode(bytes);
      return transaction(()=>{
        if(db.prepare('SELECT 1 FROM observed_inputs WHERE input_ref=?').get(inputRef))reject('jobs_input_exists');
        const sealedName=`${randomUUID()}${extension}`;put(path.join(roots.observed,sealedName),bytes);
        db.prepare('INSERT INTO observed_inputs VALUES(?,?,?,?,?,?,?)').run(inputRef,documentRef,relativePath,expected,bytes.length,textEligible?1:0,sealedName);
        return {input_ref:inputRef,document_ref:documentRef,sha256:expected,size_bytes:bytes.length,admission:'observed_local_bytes_only',model_text_eligible:textEligible,attachment_admission_verified:false};
      });
    },
    createDocument(request){
      exact(request,['referenceRef','title']);const {referenceRef,title}=request;
      current();reference(referenceRef);entryFor(referenceRef);
      if(typeof title!=='string'||!title.trim()||title.length>160||/[\x00-\x1f]/.test(title))reject('jobs_title_invalid');
      return transaction(()=>{const id=`document.${randomUUID()}`;db.prepare('INSERT INTO documents VALUES(?,?,?,?)').run(id,referenceRef,title,Date.now());return {document_ref:id,reference_ref:referenceRef,title};});
    },
    issueRevision(request){
      exact(request,['documentRef','inputRefs']);const {documentRef,inputRefs}=request;
      current();const doc=document(documentRef),{seed,author,referenceBinding}=entryFor(doc.reference_ref);
      if(!Array.isArray(inputRefs)||inputRefs.length<1||inputRefs.length>16||new Set(inputRefs).size!==inputRefs.length)reject('jobs_inputs_required');
      const inputs=inputRefs.map(ref=>{reference(ref);const row=db.prepare('SELECT * FROM observed_inputs WHERE input_ref=? AND document_ref=?').get(ref,documentRef);if(!row||row.text_eligible!==1)reject('jobs_input_not_admitted');pinned({path:path.join(roots.observed,row.sealed_name),sha256:row.sha256},65536);return row;});
      const issuedAt=Date.now(),expiresAt=Math.min(issuedAt+config.job_lifetime_ms,config.issuance_expires_at,seed.expiresAt);
      if(!Number.isSafeInteger(expiresAt)||expiresAt<=issuedAt)reject('jobs_issuance_expired');
      const row=transaction(()=>{
        if(db.prepare(`SELECT 1 FROM jobs WHERE document_ref=? AND state IN (${BLOCKING.map(()=>'?').join(',')})`).get(documentRef,...BLOCKING))reject('jobs_previous_unclosed');
        const revision=db.prepare('SELECT COALESCE(MAX(revision),0)+1 revision FROM jobs WHERE document_ref=?').get(documentRef).revision,id=`job.${randomUUID()}`;
        db.prepare("INSERT INTO jobs(job_ref,document_ref,revision,state,issued_at,expires_at) VALUES(?,?,?,'PREPARING',?,?)").run(id,documentRef,revision,issuedAt,expiresAt);return job(id);
      });
      try{
        const protectedRoot=path.join(roots.jobs,row.job_ref),jobRoot=path.join(jobsRoot,row.job_ref);mkdirSync(protectedRoot);mkdirSync(jobRoot);
        const dirs=Object.fromEntries(['control','input','work','output','native-work','native-output'].map(name=>{const value=path.join(protectedRoot,name);mkdirSync(value);return [name,value];}));
        const queueRoot=path.join(roots.queues,hwpxReferenceBindingDigest(referenceBinding));if(!existsSync(queueRoot))mkdirSync(queueRoot);else rootPath(queueRoot);
        const configAuthor={...author,job_ref:row.job_ref,revision:`revision.${row.revision}`,approval_ref:config.issuance_approval_ref,input_root:dirs.input,work_root:dirs.work,output_root:dirs.output,queue_root:queueRoot};
        const hwpx={author:put(path.join(dirs.control,'author.json'),configAuthor),native:null,pdf:null};
        if(seed.hwpx.native!==null){const native={...json(seed.hwpx.native),input_root:dirs.output,work_root:dirs['native-work'],output_root:dirs['native-output']};hwpx.native=put(path.join(dirs.control,'native.json'),native);hwpx.pdf=put(path.join(dirs.control,'pdf.json'),{...json(seed.hwpx.pdf),pdf_root:native.output_root});}
        const inputFiles=inputs.map((input,index)=>{const relative=`input-${index+1}${path.extname(input.sealed_name)}`;validateWorkspaceRelativePath(relative);put(path.join(jobRoot,relative),pinned({path:path.join(roots.observed,input.sealed_name),sha256:input.sha256},65536));return {path:relative,sha256:input.sha256};});
        const binding={...seed,jobRef:row.job_ref,workRoot:work,jobRoot,inputFiles,expiresAt,hwpx};
        const descriptor=put(path.join(dirs.control,'binding.json'),binding);loadBinding(descriptor.path,descriptor.sha256);
        transaction(()=>{db.prepare("UPDATE jobs SET state='READY',binding_path=?,binding_sha256=? WHERE job_ref=? AND state='PREPARING'").run(descriptor.path,descriptor.sha256,row.job_ref);});
        return jobView(job(row.job_ref));
      }catch(error){transaction(()=>db.prepare("UPDATE jobs SET state='PREPARATION_FAILED' WHERE job_ref=? AND state='PREPARING'").run(row.job_ref));throw error;}
    },
    startJob(jobRef){return transaction(()=>{
      const row=job(jobRef);if(row.state!=='READY'||Date.now()>=Math.min(row.expires_at,config.issuance_expires_at))reject('jobs_start_forbidden');
      if(db.prepare("SELECT 1 FROM jobs WHERE state IN ('EXECUTION_UNKNOWN','CANCEL_REQUESTED')").get())reject('jobs_workshop_busy');
      loadBinding(row.binding_path,row.binding_sha256);const executionRef=randomUUID();
      db.prepare("UPDATE jobs SET state='EXECUTION_UNKNOWN',execution_ref=? WHERE job_ref=?").run(executionRef,jobRef);
      const token=Object.freeze({job_ref:jobRef,observer_ref:executionRef});tokens.set(token,{job_ref:jobRef,execution_ref:executionRef});
      return {executionToken:token,job:jobView(job(jobRef))};
    });},
    cancelJob(jobRef){return transaction(()=>{const row=job(jobRef);const state=row.state==='READY'?'CANCELLED':ACTIVE.includes(row.state)?'CANCEL_REQUESTED':row.state;db.prepare('UPDATE jobs SET state=? WHERE job_ref=?').run(state,jobRef);return jobView(job(jobRef));});},
    collectResult(token){
      const row=execution(token);if(Date.now()>=row.expires_at)reject('jobs_result_expired');if(row.result_sha256)return readResult(row);
      const binding=loadBinding(row.binding_path,row.binding_sha256),author=binding.hwpxConfiguration.author;
      const operation=path.join(author.work_root,`claude-hwpx-${sha256(row.job_ref).slice(0,32)}`),intentPath=path.join(operation,'intent.json'),resultPath=path.join(operation,'result.json');
      const intent=JSON.parse(boundedRead(intentPath,16384)),resultBytes=boundedRead(resultPath,128*1024),result=JSON.parse(resultBytes);
      exact(intent,['version','binding_sha256','job_ref','draft_path','draft_sha256']);
      if(intent.version!==1||intent.job_ref!==row.job_ref||intent.binding_sha256!==row.binding_sha256||!inside(binding.jobRoot,intent.draft_path))reject('jobs_result_invalid');
      pinned({path:intent.draft_path,sha256:intent.draft_sha256},65536);
      exact(result,['state','job_ref','hwpx','pdf','all_page_evidence','render_required','visual_review_required','accepted','official_done']);
      if(result.job_ref!==row.job_ref||result.accepted!==false||result.official_done!==false||result.visual_review_required!==true)reject('jobs_result_invalid');
      // The legacy queue reader may adopt a missing marker. Historical result
      // lookup must instead refuse that condition without repairing the queue.
      const marker=path.join(author.queue_root,'workshop.initialized');
      if(!existsSync(marker)||!boundedRead(marker,4096).equals(Buffer.from('soulforge.tool_workshop_state.v1\n')))reject('jobs_custody_required');
      directPath(path.join(author.queue_root,'workshop.sqlite'));
      const queue=createDurableToolWorkshop({stateRoot:author.queue_root,mode:'open_existing',readOnly:true}),receipt=queue.getCustodyReceipt(row.job_ref);
      const queued=queue.getJob(row.job_ref);
      if(queued?.project_ref!==binding.projectRef||queued.approval_ref!==author.approval_ref||queued.required_tool_version!=='tool.reference_hwpx:v1')reject('jobs_custody_required');
      const referenceBinding=json(author.reference_binding);verifyHwpxReferenceBinding(referenceBinding);
      if(receipt?.artifact?.binding_digest!==hwpxReferenceBindingDigest(referenceBinding)||receipt.artifact.template_sha256!==referenceBinding.template_sha256||receipt.artifact.validator_ref!=='validator.hwpx_reference_readback:v1'||receipt.project_ref!==binding.projectRef)reject('jobs_custody_required');
      const members=[];
      function member(name,item,root){exact(item,['artifact_ref','sha256','size_bytes','path']);if(!inside(root,item.path)||item.artifact_ref!==`artifact.sha256:${item.sha256}`||!Number.isSafeInteger(item.size_bytes)||pinned({path:item.path,sha256:item.sha256},MAX).length!==item.size_bytes)reject('jobs_result_invalid');members.push({name,path:item.path,sha256:item.sha256,size_bytes:item.size_bytes});}
      if(result.hwpx?.path!==path.join(author.output_root,`${receipt.artifact.sha256}.hwpx`)||result.hwpx.sha256!==receipt.artifact.sha256||result.hwpx.size_bytes!==receipt.artifact.size_bytes)reject('jobs_custody_required');
      member('document.hwpx',result.hwpx,author.output_root);
      if(binding.hwpxConfiguration.native===null){if(result.state!=='structural_candidate'||result.pdf!==null||result.all_page_evidence!==null||result.render_required!==true)reject('jobs_result_invalid');}
      else{
        if(result.state!=='rendered_candidate'||result.render_required!==false)reject('jobs_result_invalid');member('document.pdf',result.pdf,operation);
        const native=JSON.parse(boundedRead(path.join(operation,'native-result.json'),16384)),runId=`claude-${sha256([row.binding_sha256,row.job_ref,intent.draft_sha256].join(':')).slice(0,32)}`;
        exact(native,['pdf_path','pdf_sha256','pdf_size_bytes','hwpx_sha256','cleanup_verified']);
        if(native.pdf_path!==path.join(binding.hwpxConfiguration.native.output_root,`${runId}.pdf`)||native.pdf_sha256!==result.pdf.sha256||native.pdf_size_bytes!==result.pdf.size_bytes||native.hwpx_sha256!==result.hwpx.sha256||native.cleanup_verified!==true)reject('jobs_result_invalid');pinned({path:native.pdf_path,sha256:native.pdf_sha256},MAX);
        const pages=result.all_page_evidence;exact(pages,['page_count','page_count_basis','manifest_path','manifest_sha256','images']);
        if(!Number.isInteger(pages.page_count)||pages.page_count<1||pages.page_count>64||!['observed','expected_match'].includes(pages.page_count_basis)||!inside(operation,pages.manifest_path)||!Array.isArray(pages.images)||pages.images.length!==pages.page_count)reject('jobs_result_invalid');
        const bytes=pinned({path:pages.manifest_path,sha256:pages.manifest_sha256},32768),manifest=JSON.parse(bytes);exact(manifest,['page_count','renders']);
        if(manifest.page_count!==pages.page_count||manifest.renders.length!==pages.page_count)reject('jobs_result_invalid');members.push({name:'pages.json',path:pages.manifest_path,sha256:pages.manifest_sha256,size_bytes:bytes.length});
        for(const [index,image]of pages.images.entries()){exact(image,['path','sha256','size_bytes','width','height']);const {path:file,...render}=image;if(!inside(operation,file)||image.width!==794||image.height!==1123||JSON.stringify(render)!==JSON.stringify(manifest.renders[index]))reject('jobs_result_invalid');member(`page-${index+1}.png`,{path:file,sha256:image.sha256,size_bytes:image.size_bytes,artifact_ref:`artifact.sha256:${image.sha256}`},operation);}
      }
      execution(token);const base=path.join(roots.sealed,row.job_ref);mkdirSync(base);
      const artifacts=members.map(({path:file,...metadata})=>{put(path.join(base,metadata.name),pinned({path:file,sha256:metadata.sha256},MAX));return metadata;});
      const manifest={job_ref:row.job_ref,document_ref:row.document_ref,revision:row.revision,source_result_sha256:sha256(resultBytes),state:result.state,render_required:result.render_required,visual_review_required:true,accepted:false,official_done:false,artifacts};
      const sealed=put(path.join(base,'manifest.json'),manifest);transaction(()=>db.prepare('UPDATE jobs SET result_sha256=? WHERE job_ref=?').run(sealed.sha256,row.job_ref));return readResult(job(row.job_ref));
    },
    closeJob(token,observation){exact(observation,['directChildClosed','outcome']);const {directChildClosed,outcome}=observation;return transaction(()=>{
      const row=execution(token);if(directChildClosed!==true||!['completed','failed','cancelled'].includes(outcome))reject('jobs_child_closure_required');
      if(outcome==='completed'&&(!row.result_sha256||Date.now()>=row.expires_at||row.state==='CANCEL_REQUESTED'))reject('jobs_completion_forbidden');
      if(outcome==='completed')readResult(row);
      const state=outcome==='completed'?'COMPLETED_CANDIDATE':outcome==='cancelled'?'CANCELLED':'FAILED';db.prepare('UPDATE jobs SET state=? WHERE job_ref=?').run(state,row.job_ref);tokens.delete(token);return jobView(job(row.job_ref));
    });},
    listDocuments(){current();return db.prepare('SELECT * FROM documents ORDER BY created_at,document_ref').all();},
    getDocument(documentRef){current();return {...document(documentRef),jobs:db.prepare('SELECT * FROM jobs WHERE document_ref=? ORDER BY revision').all(documentRef).map(jobView)};},
    getJob(jobRef){current();return jobView(job(jobRef));},
    getResult(jobRef){current();return readResult(job(jobRef));},
    close(){if(!closed){closed=true;db.close();}},
  });
}
