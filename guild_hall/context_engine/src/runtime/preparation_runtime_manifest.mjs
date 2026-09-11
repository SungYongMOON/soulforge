// Read-only, explicit Windows CPython runtime inventory. No Python executes
// before this inventory is checked against the approved binding.
import {readdirSync,lstatSync,readFileSync,realpathSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {createHash} from 'node:crypto';

const sha=bytes=>'sha256:'+createHash('sha256').update(bytes).digest('hex');
const packages=new Set(['pdfplumber','pdfminer','pypdfium2','pypdfium2_raw','pypdfium2_cfg','pypdfium2_cli',
  'PIL','charset_normalizer','cryptography','cffi','pycparser']);
const distribution=/^(?:pdfplumber|pdfminer_six|pypdfium2|pillow|charset_normalizer|cryptography|cffi|pycparser)-[^/]+\.dist-info$/u;
const failure=()=>{throw new Error('preparation runtime inventory unavailable');};

export function inspectRuntimeManifest(interpreterPath){
  if(process.platform!=='win32')failure();
  const root=dirname(resolve(interpreterPath)),files=[],directories=[];
  let bytes=0;
  const visit=(ref,select=()=>true)=>{
    const path=join(root,ref),stat=lstatSync(path);
    if(stat.isSymbolicLink() || realpathSync(path)!==resolve(path))failure();
    if(stat.isDirectory()){
      directories.push(ref);
      for(const name of readdirSync(path).sort())if(select(name))visit(ref?ref+'/'+name:name);
    }else if(stat.isFile()){
      if(stat.size>256*1024*1024 || files.length>=20000 || bytes+stat.size>1024*1024*1024)failure();
      const body=readFileSync(path);bytes+=body.length;files.push([ref,sha(body)]);
    }else failure();
  };
  const top=readdirSync(root).sort();
  // This fixed layout has no venv/path override; such configurations require a
  // separately reviewed runtime profile before any interpreter invocation.
  if(top.some(name=>name.toLowerCase()==='pyvenv.cfg'||name.toLowerCase().endsWith('._pth')))failure();
  for(const name of top)if(!lstatSync(join(root,name)).isDirectory())visit(name);
  for(const required of ['python.exe','python3.dll','python312.dll','vcruntime140.dll','vcruntime140_1.dll'])
    if(!files.some(([ref])=>ref===required))failure();
  visit('DLLs');visit('Lib',name=>name!=='site-packages');
  const site='Lib/site-packages',members=readdirSync(join(root,site)).sort();
  for(const name of packages)if(!members.includes(name))failure();
  const selected=members.filter(name=>packages.has(name)||distribution.test(name)
    || /^_cffi_backend[^/]*\.pyd$/u.test(name)||/^(?:pillow|cryptography|cffi)\.libs$/u.test(name)
    || /\.pth$/u.test(name)||/^sitecustomize(?:\.py|\.pyc)?$/u.test(name)||/^usercustomize(?:\.py|\.pyc)?$/u.test(name));
  if(selected.filter(name=>distribution.test(name)).length!==8)failure();
  for(const name of selected)visit(site+'/'+name);
  files.sort(([a],[b])=>a<b?-1:a>b?1:0);directories.sort();
  return {layout:'windows-cpython312-parser-v1',flags:['-I','-B','-S'],site_startup:'disabled',
    package_root:site,root_members:top,site_members:members,directories,files,
    file_count:files.length,total_bytes:bytes,tree_sha256:sha(JSON.stringify({files,directories}))};
}
