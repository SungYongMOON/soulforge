// Display metadata only: never grants project authority or changes a binding.
export function readProjectLabel(io,project,fsKey=project){
  try{
    if(!/^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+$/u.test(project)||!/^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/u.test(fsKey))return null;
    const value=JSON.parse(io.read(`data_root/20_PROJECTS/${fsKey}/00_프로젝트_안내/project_identity.json`,65536).toString('utf8'));
    if(value.project_code!==project||value.approved_fs_key!==fsKey||typeof value.project_name!=='string')return null;
    const name=value.project_name.replace(new RegExp(`^${project}\\s*`),'').trim();
    if(!name||name.length>160||/[\x00-\x1f\x7f\\/]/u.test(name))return null;
    return name;
  }catch{return null;}
}
