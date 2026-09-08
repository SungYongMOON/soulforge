import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { spawnSync } from 'node:child_process';
import * as realFs from 'node:fs';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, readdirSync, linkSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as realFiles from '../src/workshop_files.mjs';

const file = fileURLToPath(import.meta.url);
// Keep the ordinary node --test entry point usable. Module mocks only exist in
// this child test process; no synthetic executor hook ships in the adapter.
if (!process.execArgv.includes('--experimental-test-module-mocks')) {
  test('Hancom adapter synthetic and source gates (no native execution)',()=>{
    const env={...process.env};delete env.NODE_TEST_CONTEXT;
    const filter=process.execArgv.find(arg=>arg.startsWith('--test-name-pattern='));
    const result=spawnSync(process.execPath,['--experimental-test-module-mocks','--test',...(filter?[filter]:[]),file],{encoding:'utf8',timeout:30000,windowsHide:true,env});
    assert.equal(result.status,0,result.stdout+result.stderr);
    assert.match(result.stdout,/PowerShell AST parse only/,'The nested test suite must actually execute.');
  });
} else {
  const official='9ac5b97c47ac8aed1e8bca27a3eef39411361d8f68c262509f0c40a8f9d21bb6';
  const dll=Buffer.from('synthetic-approved-dll-identity');
  let behavior='success',spawns=0,abortAtPublication=null,abortAfterDispatch=null,runtimeReparse=false,runtimeLinks=null;
  mock.module('node:fs',{namedExports:{...realFs,
    lstatSync:(file,...args)=>{
      const entry=realFs.lstatSync(file,...args);
      if(typeof file==='string' && file.toLowerCase().endsWith(path.join('SysWOW64','WindowsPowerShell','v1.0','powershell.exe').toLowerCase())) {
        if(runtimeLinks!==null)entry.nlink=runtimeLinks;
        if(runtimeReparse)entry.isSymbolicLink=()=>true;
      }
      return entry;
    },
    fsyncSync:fd=>{realFs.fsyncSync(fd);abortAtPublication?.();},
    writeFileSync:(file,...args)=>{
      if(typeof file==='number' && behavior==='partial_write') {
        realFs.writeFileSync(file,Buffer.from('%PDF-'));
        throw Object.assign(new Error('synthetic partial write'),{code:'EIO'});
      }
      return realFs.writeFileSync(file,...args);
    }
  }});
  mock.module('../src/workshop_files.mjs',{namedExports:{...realFiles,sha256:bytes=>Buffer.isBuffer(bytes)&&bytes.equals(dll)?official:realFiles.sha256(bytes)}});
  mock.module('node:child_process',{namedExports:{spawn:()=>{
    spawns++;
    const child=new EventEmitter();child.stdin=new PassThrough();child.stdout=new PassThrough();child.stderr=new PassThrough();
    let text='';child.stdin.on('data',chunk=>text+=chunk);
    child.kill=()=>{child.emit('close',1);};
    child.stdin.on('finish',()=>{
      const r=JSON.parse(text);
      setTimeout(()=>{
        if (behavior==='input_change')writeFileSync(r.input_path,Buffer.from('changed'));
        if (behavior==='occupied_output')writeFileSync(r.pdf_path,'outsider');
        writeFileSync(path.join(r.run_root,'export.pending.pdf'),behavior==='invalid_pdf'?'not pdf':'%PDF-1.4\nsynthetic only\n%%EOF\n',{flag:'wx'});
        abortAfterDispatch?.();
        child.stdout.end(JSON.stringify({ok:true,cleanup_verified:behavior!=='cleanup_failure'}));
        child.emit('close',0);
      },behavior==='slow'?80:2);
    });
    return child;
  }}});
  const {renderHwpxToPdf,preflightHwpxToPdf,HANCOM_RENDERER_REF}=await import('../src/hancom_hwpx_render.mjs');
  function fixture() {
    const root=mkdtempSync(path.join(tmpdir(),'hancom-synthetic-'));
    const [input,output,work]=['input','output','work'].map(name=>{const dir=path.join(root,name);mkdirSync(dir);return dir;});
    const inputPath=path.join(input,'source.hwpx');writeFileSync(inputPath,Buffer.from([80,75,3,4,0,0,1,2]));
    if(process.platform!=='win32')process.env.SystemRoot=path.join(root,'Windows');
    const runtime=path.join(process.env.SystemRoot,'SysWOW64','WindowsPowerShell','v1.0','powershell.exe'),hwp=path.join(root,'Hwp.exe'),security=path.join(root,'checker.dll');
    // Windows runtime is read-only metadata evidence; never overwrite or run it.
    if(process.platform!=='win32'){mkdirSync(path.dirname(runtime),{recursive:true});writeFileSync(runtime,'synthetic runtime');}
    writeFileSync(hwp,'synthetic hwp');writeFileSync(security,dll);
    const script=fileURLToPath(new URL('../src/hancom_hwpx_export.ps1',import.meta.url));
    const hash=file=>realFiles.sha256(readFileSync(file));
    const binding={enabled:true,renderer_ref:HANCOM_RENDERER_REF,input_root:input,output_root:output,work_root:work,powershell_executable:runtime,powershell_sha256:hash(runtime),hwp_executable:hwp,hwp_sha256:hash(hwp),security_module_dll:security,security_module_sha256:official,script_path:script,script_sha256:hash(script),user_sid:'S-1-5-21-1-2-3-1001'};
    return {inputPath,expectedInputSha256:hash(inputPath),outputRoot:output,runId:'synthetic-0001',binding,deadline:performance.now()+2000};
  }
  test('disabled, malformed and drifted bindings have no writer or spawn effects',async()=>{
    const a=fixture(),before=spawns;
    for(const binding of [undefined,{...a.binding,enabled:false}])await assert.rejects(renderHwpxToPdf({...a,binding}),{code:'renderer_disabled'});
    assert.throws(()=>preflightHwpxToPdf({...a,binding:{...a.binding,command:'not allowed'}}),{code:'unexpected_fields'});
    assert.throws(()=>preflightHwpxToPdf({...a,binding:{...a.binding,security_module_sha256:'a'.repeat(64)}}),{code:'binding_invalid'});
    writeFileSync(a.binding.hwp_executable,'runtime drift');
    assert.throws(()=>preflightHwpxToPdf(a),{code:'binding_drift'});
    assert.equal(spawns,before);assert.deepEqual(readdirSync(a.binding.work_root),[]);assert.deepEqual(readdirSync(a.outputRoot),[]);
  });
  test('preflight validates hashes, hardlinks, roots, output collision and is read-only',()=>{
    const a=fixture(),before=spawns;
    assert.equal(preflightHwpxToPdf(a).native_checks,'not_run');
    assert.equal(spawns,before);assert.deepEqual(readdirSync(a.binding.work_root),[]);
    assert.throws(()=>preflightHwpxToPdf({...a,expectedInputSha256:'b'.repeat(64)}),{code:'input_invalid'});
    assert.throws(()=>preflightHwpxToPdf({...a,inputPath:'\\\\server\\share\\file.hwpx'}),{code:'local_path_required'});
    assert.throws(()=>preflightHwpxToPdf({...a,binding:{...a.binding,work_root:a.outputRoot}}),{code:'roots_overlap'});
    writeFileSync(path.join(a.outputRoot,`${a.runId}.pdf`),'existing');
    assert.throws(()=>preflightHwpxToPdf(a),{code:'output_exists'});
    const b=fixture();linkSync(b.inputPath,path.join(b.binding.input_root,'hardlink.hwpx'));
    assert.throws(()=>preflightHwpxToPdf(b),{code:'path_type_invalid'});
  });
  test('only exact pinned system PowerShell admits OS hardlinks; drift, reparse and data links remain blocked',()=>{
    const a=fixture(),before=spawns;
    runtimeLinks=2;
    try {
      assert.equal(preflightHwpxToPdf(a).native_checks,'not_run');
      assert.throws(()=>preflightHwpxToPdf({...a,binding:{...a.binding,powershell_sha256:'0'.repeat(64)}}),{code:'binding_drift'});
      for(const wrong of [path.join(path.dirname(a.binding.hwp_executable),'powershell.exe'),a.binding.powershell_executable.replace('SysWOW64','System32')]) {
        assert.throws(()=>preflightHwpxToPdf({...a,binding:{...a.binding,powershell_executable:wrong}}),{code:'system_powershell_required'});
      }
      runtimeReparse=true;
      assert.throws(()=>preflightHwpxToPdf(a),{code:'path_type_invalid'});
    } finally {runtimeLinks=null;runtimeReparse=false;}
    for(const key of ['hwp_executable','security_module_dll']) {
      const b=fixture();linkSync(b.binding[key],path.join(path.dirname(b.binding[key]),'hardlink-copy'));
      assert.throws(()=>preflightHwpxToPdf(b),{code:'path_type_invalid'});
    }
    assert.equal(spawns,before);assert.deepEqual(readdirSync(a.binding.work_root),[]);assert.deepEqual(readdirSync(a.outputRoot),[]);
  });
  test('expired and pre-cancelled requests have zero writer effects',async()=>{
    const a=fixture(),controller=new AbortController();controller.abort();
    await assert.rejects(renderHwpxToPdf({...a,signal:controller.signal}),{code:'cancelled'});
    await assert.rejects(renderHwpxToPdf({...a,deadline:performance.now()-1}),{code:'runner_timeout'});
    assert.deepEqual(readdirSync(a.binding.work_root),[]);
  });
  test('synthetic receipt is metadata only and failed cleanup never succeeds',{skip:process.platform!=='win32'},async()=>{
    behavior='success';const a=fixture();
    const result=await renderHwpxToPdf(a);
    assert.deepEqual(Object.keys(result),['pdf_path','pdf_sha256','pdf_size_bytes','input_sha256','renderer_ref','cleanup_verified']);
    assert.equal(result.cleanup_verified,true);assert.equal(result.input_sha256,a.expectedInputSha256);
    await assert.rejects(renderHwpxToPdf(a),{code:'output_exists'});
    for (const [mode,code] of [['cleanup_failure','cleanup_unverified'],['invalid_pdf','pdf_invalid'],['input_change','input_changed'],['occupied_output','output_exists'],['partial_write','renderer_failed']]) {
      const f=fixture();behavior=mode;await assert.rejects(renderHwpxToPdf(f),{code});
      const finalPath=path.join(f.outputRoot,`${f.runId}.pdf`);
      if(mode==='occupied_output')assert.equal(readFileSync(finalPath,'utf8'),'outsider','A foreign collision must remain untouched.');
      else assert.equal(existsSync(finalPath),false,`${mode} must not leave a final PDF.`);
      assert.equal(existsSync(path.join(f.binding.work_root,f.runId,'export.pending.pdf')),true,'Failed bytes remain in the quarantined run root.');
    }
  });
  test('deadline and cancellation stay failures even if dispatcher later emits success',{skip:process.platform!=='win32'},async()=>{
    behavior='slow';const a=fixture();a.deadline=performance.now()+30;
    await assert.rejects(renderHwpxToPdf(a),{code:'runner_timeout'});
    assert.deepEqual(readdirSync(a.outputRoot),[]);
    const controller=new AbortController(),b=fixture();setTimeout(()=>controller.abort(),20);
    await assert.rejects(renderHwpxToPdf({...b,signal:controller.signal}),{code:'cancelled'});
    assert.deepEqual(readdirSync(b.outputRoot),[]);
    assert.equal(readFileSync(path.join(b.binding.work_root,b.runId,'cancel'),'utf8'),'cancel');
    behavior='success';
  });
  test('late abort after native PDF creation or during publication leaves no final PDF',{skip:process.platform!=='win32'},async()=>{
    for(const point of ['dispatch','publication']) {
      behavior='success';const a=fixture(),controller=new AbortController();
      if(point==='dispatch')abortAfterDispatch=()=>controller.abort();
      else abortAtPublication=()=>controller.abort();
      try {
        await assert.rejects(renderHwpxToPdf({...a,signal:controller.signal}),{code:'cancelled'});
        assert.deepEqual(readdirSync(a.outputRoot),[]);
        assert.equal(existsSync(path.join(a.binding.work_root,a.runId,'export.pending.pdf')),true);
      } finally {abortAfterDispatch=null;abortAtPublication=null;}
    }
  });
  test('native source protects foreign resources and uses the supported narrow COM path',()=>{
    const ps=readFileSync(fileURLToPath(new URL('../src/hancom_hwpx_export.ps1',import.meta.url)),'utf8');
    assert.match(ps,/RegisterTaskDefinition\(\$r.task_name,\$definition,2,/);
    assert.match(ps,/Principal.RunLevel = 0/);assert.match(ps,/Principal.LogonType = 3/);
    assert.match(ps,/Assert-True \(\[SoulforgeHwpxNative\]::Unpackaged\(\)\)/);
    assert.match(ps,/Assert-NoHwp/);assert.match(ps,/\$current.Xml -ceq \$taskXml/);
    assert.match(ps,/\$registry.GetValueNames\(\) -notcontains \$r.module_name/);
    assert.doesNotMatch(ps,/Stop-Process|taskkill|SetMessageBoxMode|SendKeys|Start-Process|PrintTo|RegisterTask[^\n]*-Force/i);
    assert.match(ps,/RegisterModule\('FilePathCheckDLL',\$r.module_name\)/);
    assert.match(ps,/Open\(\$copyPath,'HWPX'/);assert.match(ps,/SaveAs\(\$pendingPdf,'PDF',''\)/);
    assert.doesNotMatch(ps,/\[IO.File\]::Move\(\$pendingPdf,\$r.pdf_path\)/);
    assert.match(ps,/\[IO.FileShare\]::Read/);assert.match(ps,/i.links==1/);
    assert.ok(ps.indexOf("if ($Mode -eq 'Preflight')")<ps.indexOf('Add-Type -TypeDefinition'));
    assert.ok(ps.indexOf('$b.enabled -is [bool]')<ps.indexOf('Add-Type -TypeDefinition'));
  });
  test('empty run directory passes StrictMode gate; one or many entries are rejected',{skip:process.platform!=='win32'},()=>{
    const source=readFileSync(fileURLToPath(new URL('../src/hancom_hwpx_export.ps1',import.meta.url)),'utf8');
    const gate=source.split(/\r?\n/).find(line=>/Get-ChildItem.*run_root.*Count -eq 0/.test(line));
    assert.ok(gate);
    const script=`Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
function Get-ChildItem { param($LiteralPath,[switch]$Force); for($i=0;$i -lt $script:entries;$i++){[pscustomobject]@{Name='synthetic'}} }
function Assert-True($Condition) { if(-not $Condition){throw 'native_check_failed'} }
$r=[pscustomobject]@{run_root='SYNTHETIC_IN_MEMORY_DIRECTORY'}
$gate=[scriptblock]::Create('${gate.replaceAll("'","''")}')
foreach($entries in @(0,1,3)) {
  $passed=$false
  try { & $gate; $passed=$true } catch { if($_.Exception.Message -ne 'native_check_failed'){throw} }
  if($passed -ne ($entries -eq 0)){throw 'wrong_directory_result'}
}
[Console]::Out.Write('empty-pass;occupied-rejected')`;
    const result=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{encoding:'utf8',timeout:5000,windowsHide:true});
    assert.equal(result.status,0,result.stderr);assert.equal(result.stdout,'empty-pass;occupied-rejected');
  });
  test('actual PowerShell stdin decoding preserves Korean path codepoints',{skip:process.platform!=='win32'},()=>{
    const source=readFileSync(fileURLToPath(new URL('../src/hancom_hwpx_export.ps1',import.meta.url)),'utf8');
    const encoding=source.split(/\r?\n/).find(line=>line.includes('[Console]::InputEncoding ='));
    const reader=source.split(/\r?\n/).find(line=>line.includes('$json = [Console]::In.ReadToEnd()'));
    assert.ok(encoding && reader);
    const script=`$ErrorActionPreference='Stop'; ${encoding}; ${reader}; [Console]::Out.Write(($json.ToCharArray() | ForEach-Object { [int]$_ }) -join ',')`;
    const payload=JSON.stringify({synthetic_path:path.win32.join('D:', path.win32.sep, 'synthetic', '한글', '입력.hwpx')});
    const result=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{input:payload,encoding:'utf8',timeout:5000,windowsHide:true});
    assert.equal(result.status,0,result.stderr);
    assert.equal(result.stdout,[...payload].map(c=>c.codePointAt(0)).join(','));
  });
  test('native system PowerShell exception uses Known Folder and keeps its hash pin',{skip:process.platform!=='win32'},()=>{
    const source=readFileSync(fileURLToPath(new URL('../src/hancom_hwpx_export.ps1',import.meta.url)),'utf8');
    const helper=source.match(/function Assert-SystemPowerShell\([^]*?\n\}/)?.[0];assert.ok(helper);
    const script=`Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
function Assert-True($Condition){if(-not $Condition){throw 'native_check_failed'}}
function Assert-Local($Value,$Directory,$CheckLinks){if($Directory -or $CheckLinks){throw 'wrong_link_exception'};return $Value}
function Get-Hash($File){return ('a'*64)}
${helper}
$expected=Join-Path ([Environment]::GetFolderPath([Environment+SpecialFolder]::Windows)) 'SysWOW64\\WindowsPowerShell\\v1.0\\powershell.exe'
Assert-SystemPowerShell $expected ('a'*64)
foreach($case in @(@($expected,('b'*64)),@(($expected.Replace('SysWOW64','System32')),('a'*64)),@((Join-Path ([IO.Path]::GetPathRoot($expected)) 'synthetic\\powershell.exe'),('a'*64)))) {
  $rejected=$false;try{Assert-SystemPowerShell $case[0] $case[1]}catch{if($_.Exception.Message -ne 'native_check_failed'){throw};$rejected=$true}
  if(-not $rejected){throw 'missing_rejection'}
}
[Console]::Out.Write('system-only;hash-pinned')`;
    const result=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{encoding:'utf8',timeout:5000,windowsHide:true});
    assert.equal(result.status,0,result.stderr);assert.equal(result.stdout,'system-only;hash-pinned');
  });
  test('PowerShell AST parse only; never invoke the native runner',{skip:process.platform!=='win32'},()=>{
    const ps=fileURLToPath(new URL('../src/hancom_hwpx_export.ps1',import.meta.url));
    const script="$t=$null;$e=$null;[void][System.Management.Automation.Language.Parser]::ParseFile('"+ps.replaceAll("'","''")+"',[ref]$t,[ref]$e);if($e.Count){exit 1}";
    const result=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{encoding:'utf8',timeout:5000,windowsHide:true});
    assert.equal(result.status,0,result.stderr);
  });
  test('LocalServer exact quoted and unquoted paths reject other commands and ambiguous prefixes',{skip:process.platform!=='win32'},()=>{
    const source=readFileSync(fileURLToPath(new URL('../src/hancom_hwpx_export.ps1',import.meta.url)),'utf8');
    const helper=source.match(/function Assert-HwpLocalServer\([^]*?\n\}/)?.[0];assert.ok(helper);
    assert.match(source,/Assert-HwpLocalServer \$server \$b.hwp_executable/);
    const script=`Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
function Assert-True($Condition){if(-not $Condition){throw 'native_check_failed'}}
$script:collision=$false;$script:lookups=0
function Test-Path {param($LiteralPath,$PathType);$script:lookups++;if($PathType -ne 'Leaf'){throw 'unexpected_probe'};return $script:collision}
${helper}
$exe=[IO.Path]::Combine([IO.Path]::GetPathRoot([Environment]::SystemDirectory),'Synthetic Program','Hancom Office','Hwp.exe')
function Expect($Server,$Expected,$Accepted) {
  $ok=$false;try{Assert-HwpLocalServer $Server $Expected;$ok=$true}catch{if($_.Exception.Message -ne 'native_check_failed'){throw}}
  if($ok -ne $Accepted){throw 'wrong_local_server_result'}
}
foreach($suffix in @('',' -Automation',' /Automation')){Expect ('"'+$exe+'"'+$suffix) $exe $true}
foreach($suffix in @('',' -Automation',' /Automation')){Expect ($exe+$suffix) $exe $true}
foreach($other in @($exe.Replace('Hwp.exe','Other.exe'),($exe+'.other -Automation'))){Expect $other $exe $false}
Expect ($exe+' -Automation --extra') $exe $false
Expect 'Hwp.exe -Automation' 'Hwp.exe' $false
Expect ($exe+[char]10+' -Automation') $exe $false
$script:collision=$true;Expect ($exe+' -Automation') $exe $false
$count=$script:lookups;Expect ('"'+$exe+'" -Automation') $exe $true
if($script:lookups -ne $count -or $count -lt 1){throw 'prefix_probe_boundary_failed'}
[Console]::Out.Write('eight-outcomes-pass')`;
    const result=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{encoding:'utf8',timeout:5000,windowsHide:true});
    assert.equal(result.status,0,result.stderr);assert.equal(result.stdout,'eight-outcomes-pass');
  });
}
