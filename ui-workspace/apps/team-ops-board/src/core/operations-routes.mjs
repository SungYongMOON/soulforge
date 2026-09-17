const canonical={overview:'overview',system:'diagnostics',directory:'data',usage:'usage',rag:'rag',evidence:'search',memory:'memory'};
const alias=Object.fromEntries(Object.entries(canonical).flatMap(([screen,hash])=>[[screen,screen],[hash,screen]]));
export function parseConsoleRoute(hash='',search=''){
  const raw=hash.replace(/^#/,'').split('?')[0];
  const project=new URLSearchParams(search).get('project')||undefined;
  return {screen:alias[raw]??'overview',node:null,project};
}
export function consoleRouteUrl(nav,search=''){
  const params=new URLSearchParams(search);
  if(nav.project)params.set('project',nav.project);else params.delete('project');
  return `${params.size?'?'+params.toString():''}#${canonical[nav.screen]??'overview'}`;
}
