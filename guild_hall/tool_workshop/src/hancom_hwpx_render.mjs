import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, openSync, closeSync, fstatSync, lstatSync, fsyncSync, unlinkSync, realpathSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boundedRead, directPath, disjointRoots, exactKeys, reject, sha256 } from './workshop_files.mjs';

export const HANCOM_RENDERER_REF = 'renderer.hancom_hwpx_pdf:v1';
export const HANCOM_SECURITY_SHA256 = '9ac5b97c47ac8aed1e8bca27a3eef39411361d8f68c262509f0c40a8f9d21bb6';
const SCRIPT = fileURLToPath(new URL('./hancom_hwpx_export.ps1', import.meta.url));
const CODE_ROOT = path.resolve(path.dirname(SCRIPT), '../../..');
const MAX = 64 * 1024 * 1024, DIGEST = /^[a-f0-9]{64}$/;
const KEYS = ['enabled','renderer_ref','input_root','output_root','work_root','powershell_executable','powershell_sha256','hwp_executable','hwp_sha256','security_module_dll','security_module_sha256','script_path','script_sha256','user_sid'];

function local(value, directory = false) {
  if (typeof value !== 'string' || /[\x00-\x1f"<>|?*]/.test(value) || value.startsWith('\\\\') || value.startsWith('//') || (process.platform === 'win32' && !/^[A-Za-z]:[\\/]/.test(value)) || value.slice(2).includes(':')) reject('local_path_required');
  if (value.split(/[\\/]/).some(part => part === '..' || /[. ]$/.test(part))) reject('path_alias_forbidden');
  return directPath(value, directory);
}
function inside(root, file) {
  const relative = path.relative(root, file);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) reject('path_outside_root');
}
function live(signal, deadline) {
  if (signal?.aborted) reject('cancelled');
  if (!Number.isFinite(deadline) || deadline <= performance.now() || deadline - performance.now() > 120000) reject('runner_timeout');
}

function verifySystemPowerShell(file, expectedHash) {
  // Windows servicing legitimately hardlinks this OS binary. This exception
  // accepts only its exact system location and still requires the host pin.
  // The native dispatcher independently derives Windows from the Known Folder
  // API; changing SystemRoot cannot authorize another executable there.
  const windowsRoot=process.env.SystemRoot;
  if (!windowsRoot || !path.isAbsolute(windowsRoot) || typeof file!=='string' || !DIGEST.test(expectedHash ?? '')) reject('binding_drift');
  const expected=path.join(windowsRoot,'SysWOW64','WindowsPowerShell','v1.0','powershell.exe');
  if (file.toLowerCase()!==expected.toLowerCase()) reject('system_powershell_required');
  local(path.dirname(file),true);
  const entry=lstatSync(file);
  if (entry.isSymbolicLink() || !entry.isFile() || entry.nlink<1 || realpathSync(file).toLowerCase()!==file.toLowerCase()) reject('path_type_invalid');
  const fd=openSync(file,'r');
  try {
    const before=fstatSync(fd);
    if (before.size<1 || before.size>128*1024*1024 || before.dev!==entry.dev || before.ino!==entry.ino) reject('binding_drift');
    const bytes=readFileSync(fd),after=fstatSync(fd);
    if (after.size!==before.size || after.mtimeMs!==before.mtimeMs || bytes.length!==before.size || sha256(bytes)!==expectedHash) reject('binding_drift');
  } finally { closeSync(fd); }
}

// Read-only plan: no process, task, registry, folder or output creation. A plan
// confirms file pins only; native session/task/COM checks still run at execution.
export function preflightHwpxToPdf({inputPath, expectedInputSha256, outputRoot, runId, binding, signal, deadline}) {
  if (binding?.enabled !== true) reject('renderer_disabled');
  exactKeys(binding, KEYS);
  if (binding.renderer_ref !== HANCOM_RENDERER_REF || binding.security_module_sha256 !== HANCOM_SECURITY_SHA256 || !/^S-1-5-21-(\d+-){2}\d+-\d+$/.test(binding.user_sid ?? '') || !/^[a-z0-9][a-z0-9-]{7,63}$/.test(runId ?? '')) reject('binding_invalid');
  live(signal, deadline);
  for (const key of ['input_root','output_root','work_root']) local(binding[key], true);
  disjointRoots([binding.input_root,binding.output_root,binding.work_root,CODE_ROOT]);
  for (const root of [binding.input_root,binding.output_root,binding.work_root]) if (root.split(/[\\/]/).some(part => ['_workspaces','_workmeta'].includes(part.toLowerCase()))) reject('canonical_root_forbidden');
  if (local(outputRoot,true) !== local(binding.output_root,true) || local(binding.script_path) !== local(SCRIPT)) reject('binding_drift');
  verifySystemPowerShell(binding.powershell_executable,binding.powershell_sha256);
  for (const [file,hash] of [[binding.hwp_executable,binding.hwp_sha256],[binding.security_module_dll,binding.security_module_sha256],[binding.script_path,binding.script_sha256]]) {
    if (!DIGEST.test(hash ?? '') || sha256(boundedRead(local(file),128*1024*1024)) !== hash) reject('binding_drift');
  }
  inputPath = local(inputPath); inside(binding.input_root,inputPath);
  if (path.extname(inputPath).toLowerCase() !== '.hwpx' || !DIGEST.test(expectedInputSha256 ?? '')) reject('input_invalid');
  const bytes = boundedRead(inputPath, MAX);
  if (sha256(bytes) !== expectedInputSha256 || !bytes.subarray(0,4).equals(Buffer.from([80,75,3,4]))) reject('input_invalid');
  const runRoot = path.join(binding.work_root,runId), pdfPath = path.join(outputRoot,`${runId}.pdf`);
  if (existsSync(runRoot) || existsSync(pdfPath)) reject('output_exists');
  return Object.freeze({renderer_ref:HANCOM_RENDERER_REF,run_root:runRoot,pdf_path:pdfPath,input_sha256:expectedInputSha256,task_name:`Soulforge-Hwpx-${runId}`,module_name:`SoulforgeHwpx_${runId}`,native_checks:'not_run'});
}

// This is a narrowly scoped dispatcher, not the generic bounded process helper:
// killing a COM host at deadline would skip native cleanup. The dispatcher has
// its own deadline and a fixed cleanup grace; only it may stop its owned task.
function dispatch(binding, request, signal, deadline, mode='Dispatch') {
  return new Promise((resolve, fail) => {
    const readOnly=mode==='ExistingPreflight';
    let child, stopCode = null, stdout = '', count = 0;
    const cancelPath = path.join(request.run_root,'cancel');
    const cancel = code => {
      stopCode ??= code;
      if(readOnly){child.kill();return;}
      try { writeFileSync(cancelPath,'cancel',{flag:'wx'}); } catch (error) { if (error.code !== 'EEXIST') stopCode = 'cleanup_unverified'; }
    };
    const onAbort = () => cancel('cancelled');
    child = spawn(binding.powershell_executable,['-NoProfile','-NonInteractive','-WindowStyle','Hidden','-File',binding.script_path,'-Mode',mode],{windowsHide:true,shell:false,stdio:['pipe','pipe','pipe']});
    const timeout = setTimeout(() => cancel('runner_timeout'),Math.max(1,deadline-performance.now()));
    const hardStop = setTimeout(() => { stopCode='cleanup_unverified';child.kill(); },Math.max(1,deadline-performance.now())+15000);
    signal?.addEventListener('abort',onAbort,{once:true});
    if (signal?.aborted) onAbort();
    child.stdin.on('error',()=>{});
    child.stdout.on('data',bytes=>{count+=bytes.length;if(count>4096)cancel('renderer_failed');else stdout+=bytes.toString('utf8');});
    child.stderr.on('data',bytes=>{count+=bytes.length;if(count>4096)cancel('renderer_failed');});
    child.on('error',()=>{stopCode='renderer_failed';});
    child.on('close',code=>{
      clearTimeout(timeout);clearTimeout(hardStop);signal?.removeEventListener('abort',onAbort);
      try {
        const receipt=JSON.parse(stdout); exactKeys(receipt,['ok','cleanup_verified',...(mode==='Dispatch'?[]:['code'])]);
        if (receipt.cleanup_verified !== true) reject('cleanup_unverified');
        if(mode!=='Dispatch' && receipt.ok!==true && ['existing_session_required','existing_alias_invalid','existing_session_busy'].includes(receipt.code))reject(receipt.code);
        if (stopCode || code !== 0 || receipt.ok !== true) reject(stopCode ?? 'renderer_failed');
        resolve(receipt);
      } catch(error) { fail(Object.assign(new Error(error.code ?? 'cleanup_unverified'),{code:error.code ?? 'cleanup_unverified'})); }
    });
    child.stdin.end(JSON.stringify(request));
  });
}

export async function renderHwpxToPdf(args) {
  const plan=preflightHwpxToPdf(args);
  if (process.platform !== 'win32') reject('windows_required');
  const {inputPath,expectedInputSha256,outputRoot,runId,signal,deadline}=args;
  const binding=structuredClone(args.binding);
  live(signal,deadline);
  // mkdir without recursive is the create-only run reservation. Retain failed
  // run roots as quarantined recovery evidence; never reuse or delete them.
  mkdirSync(plan.run_root);
  const request={...plan,input_path:inputPath,output_root:outputRoot,run_id:runId,binding,expires_at:Date.now()+Math.floor(deadline-performance.now())};
  await dispatch(binding,request,signal,deadline);
  return finishPdf(args,plan);
}

function existingPlan(args) {
  if(args.binding?.enabled!==true)reject('renderer_disabled');
  exactKeys(args.binding,[...KEYS,'existing_module_name']);
  if(args.binding.existing_module_name!=='FilePathCheckerModule')reject('existing_alias_invalid');
  const {existing_module_name,...binding}=args.binding;
  const {task_name,...plan}=preflightHwpxToPdf({...args,binding});
  return Object.freeze({...plan,module_name:existing_module_name,execution_mode:'existing_session'});
}
function existingRequest(args,plan) {
  return {...plan,input_path:args.inputPath,output_root:args.outputRoot,run_id:args.runId,binding:structuredClone(args.binding),caller_pid:process.pid,expires_at:Date.now()+Math.floor(args.deadline-performance.now())};
}
// Unlike the legacy file-only preflight, this read-only native preflight checks
// the actual parent process identity and existing alias before any run directory.
export async function preflightHwpxInExistingSession(args) {
  const plan=existingPlan(args);
  if(process.platform!=='win32')reject('windows_required');
  await dispatch(args.binding,existingRequest(args,plan),args.signal,args.deadline,'ExistingPreflight');
  return Object.freeze({...plan,native_checks:'passed_readonly'});
}
export async function renderHwpxInExistingSession(args) {
  const plan=await preflightHwpxInExistingSession(args);
  existingPlan(args);live(args.signal,args.deadline);
  mkdirSync(plan.run_root);
  await dispatch(args.binding,existingRequest(args,plan),args.signal,args.deadline,'ExistingSession');
  return finishPdf(args,plan);
}
function finishPdf(args,plan) {
  const {inputPath,expectedInputSha256,outputRoot,signal,deadline}=args;
  live(signal,deadline);
  if (sha256(boundedRead(local(inputPath),MAX)) !== expectedInputSha256) reject('input_changed');
  const bytes=boundedRead(local(path.join(plan.run_root,'export.pending.pdf')),MAX);
  if (!bytes.subarray(0,5).equals(Buffer.from('%PDF-')) || !bytes.subarray(Math.max(0,bytes.length-1024)).includes(Buffer.from('%%EOF'))) reject('pdf_invalid');
  live(signal,deadline);
  // Publish only the bytes already checked above. An occupied destination is
  // never ours; cleanup is allowed only for the exact inode created by this fd.
  let fd, identity;
  try {
    local(outputRoot,true);
    fd=openSync(plan.pdf_path,'wx');identity=fstatSync(fd);
    writeFileSync(fd,bytes);fsyncSync(fd);
    live(signal,deadline);
    closeSync(fd);fd=undefined;
  } catch(error) {
    const created=fd!==undefined;
    if (created) {
      try {
        closeSync(fd);fd=undefined;
        local(outputRoot,true);local(plan.pdf_path);
        const current=lstatSync(plan.pdf_path);
        if (!identity || current.dev!==identity.dev || current.ino!==identity.ino || current.nlink!==1) reject('cleanup_unverified');
        unlinkSync(plan.pdf_path);
      } catch { reject('cleanup_unverified'); }
    }
    reject(['cancelled','runner_timeout'].includes(error.code)?error.code:error.code==='EEXIST'?'output_exists':'renderer_failed');
  }
  return Object.freeze({pdf_path:plan.pdf_path,pdf_sha256:sha256(bytes),pdf_size_bytes:bytes.length,input_sha256:expectedInputSha256,renderer_ref:HANCOM_RENDERER_REF,cleanup_verified:true});
}
