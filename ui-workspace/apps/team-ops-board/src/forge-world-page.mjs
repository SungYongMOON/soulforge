// Native 2.5D geometry is presentation only. Every work slot comes from the
// metadata endpoint; empty plots contain no invented work or progress.
const ns = 'http://www.w3.org/2000/svg';
const viewport = document.querySelector('#viewport');
const sites = [
  {id:'SOULFORGE',title:'Soulforge 개발',subtitle:'소프트웨어 · 통합 · 출시 준비',x:495,y:360},
  {id:'P26-014',title:'P26-014',subtitle:'프로젝트 자료 · 산출물 · 검토',x:930,y:530},
];
const inWorldTree = document.body.dataset.worldHost === 'world-tree';
if(!inWorldTree)document.querySelector('nav a[href="/workbench.html"]')?.remove();
const visibleSites = () => inWorldTree ? sites.filter(site => snapshot.projects.some(project => project.project_code === site.id)) : sites;
let selected = sites[0].id;
let snapshot = {projects:[]};
let scale = 1;
const $ = selector => document.querySelector(selector);
function svg(tag, attributes={}, text) {
  const node=document.createElementNS(ns,tag);
  for(const [key,value] of Object.entries(attributes)) node.setAttribute(key,String(value));
  if(text !== undefined) node.textContent=text;
  return node;
}
function textNode(tag,text,className) {
  const node=document.createElement(tag);node.textContent=text;if(className)node.className=className;return node;
}
function poly(points,fill,attributes={}) {return svg('polygon',{points,fill,...attributes});}
function block(group,x,y,w,d,h,{roof='#d1d9cc',front='#778c85',side='#536c69'}={}) {
  group.append(poly(`${x},${y} ${x+w},${y-w*.42} ${x+w+d},${y+(d-w)*.42} ${x+d},${y+d*.42}`, '#102b31',{opacity:'.2',transform:'translate(13 12)'}));
  group.append(poly(`${x},${y-h} ${x+d},${y+d*.42-h} ${x+d},${y+d*.42} ${x},${y}`,front));
  group.append(poly(`${x+d},${y+d*.42-h} ${x+w+d},${y+(d-w)*.42-h} ${x+w+d},${y+(d-w)*.42} ${x+d},${y+d*.42}`,side));
  group.append(poly(`${x},${y-h} ${x+w},${y-w*.42-h} ${x+w+d},${y+(d-w)*.42-h} ${x+d},${y+d*.42-h}`,roof));
}
function landmark(group) {
  const x=270,y=350;
  block(group,x,y,85,145,120,{roof:'#d8ddcf',front:'#a4b4a7',side:'#708d87'});
  for(let floor=0;floor<4;floor++){
    const height=25+floor*27;
    group.append(poly(`${x+4},${y-height-18} ${x+140},${y+59-height-18} ${x+140},${y+59-height-4} ${x+4},${y-height-4}`,'#365e65'));
    group.append(svg('path',{d:`M${x+3} ${y-height}l139 59`,stroke:'#c7d5c4','stroke-width':3}));
  }
  block(group,457,355,35,42,157,{roof:'#e0e3d3',front:'#adb9a9',side:'#879d91'});
  for(let floor=0;floor<5;floor++)group.append(poly(`462,${338-floor*28} 489,${349-floor*28} 489,${332-floor*28} 462,${321-floor*28}`,'#40676d'));
  group.append(svg('text',{x:312,y:184,fill:'#ecf0df','font-size':12,'letter-spacing':3,transform:'rotate(23 312 184)'},'SONARTECH'));
  group.append(svg('text',{x:390,y:460,class:'svg-caption','text-anchor':'middle'},'공통 연구시설 · 외형 참고'));
}
function drawScene() {
  viewport.replaceChildren();
  viewport.append(svg('rect',{width:1440,height:900,fill:'url(#sea)'}),svg('rect',{width:1440,height:900,fill:'url(#water)'}));
  viewport.append(poly('30,235 190,100 500,112 1255,425 1370,540 1260,658 620,704 174,497','#23414a', {transform:'translate(0 21)',filter:'url(#shadow)'}));
  viewport.append(poly('30,235 190,100 500,112 1255,425 1370,540 1260,635 620,683 174,480','url(#land)'));
  viewport.append(svg('path',{d:'M70 255L192 134L488 145L1219 450L1304 539L1228 595L637 639L190 448Z',fill:'none',stroke:'#bac5b3','stroke-width':5,opacity:'.5'}));
  viewport.append(svg('path',{d:'M203 182L1150 571M336 163L1226 538M630 284L385 470M915 401L680 583',fill:'none',stroke:'#394f4b','stroke-width':20}));
  viewport.append(svg('path',{d:'M203 182L1150 571M336 163L1226 538',fill:'none',stroke:'#a1b0a0','stroke-width':1,'stroke-dasharray':'15 18'}));
  for(let i=0;i<23;i++){
    const x=190+i*36,y=125+i*14.5;
    viewport.append(svg('ellipse',{cx:x,cy:y,rx:13,ry:6,fill:'#304e45',opacity:'.5'}),svg('path',{d:`M${x} ${y-28}l-14 25h28Z`,fill:i%2?'#446957':'#3b5f51'}));
  }
  const building=svg('g');landmark(building);viewport.append(building);
  viewport.append(poly('1040,657 1132,614 1264,670 1171,713','#86978c'),poly('1171,713 1264,670 1264,683 1171,726','#435f61'));
  viewport.append(svg('path',{d:'M1200 746l115-47 58 24-113 47Z',fill:'#6d8c88',opacity:'.6'}));
  viewport.append(svg('text',{x:1150,y:800,class:'svg-caption','text-anchor':'middle'},'해양 시험 · 인도 근거 미연결'));
  for(const site of visibleSites()){
    const project=snapshot.projects.find(row=>row.project_code===site.id);
    const group=svg('g',{class:'plot',tabindex:0,role:'button','aria-label':`${site.title} 부지 선택`,'aria-pressed':site.id===selected,'data-site':site.id,transform:`translate(${site.x} ${site.y})`});
    group.append(poly('-100,15 100,-69 315,21 115,105',site.id===selected?'#72887a':'#5c7369',{'class':'plot-edge',stroke:site.id===selected?'#d1dfb7':'#9aae96','stroke-width':2,'stroke-dasharray':project?.slots?.length?'':'9 7'}));
    const slots=project?.slots??[];
    if(!slots.length){
      group.append(poly('-55,15 102,-51 258,14 102,80','none',{stroke:'#abc0ac',opacity:'.55','stroke-dasharray':'4 7'}));
      group.append(svg('text',{x:100,y:18,'text-anchor':'middle',fill:'#d5dfd0','font-size':12},'관측 자료 미연결'));
    }
    for(const [i,slot] of slots.slice(0,30).entries()){
      const col=i%6,row=Math.floor(i/6),x=-55+col*28+row*21,y=12-col*11+row*10;
      const colors={lit:'#bbd6a1',missing:'#c38466',warm:'#c9ab76',conflict:'#d78082',fog:'#90a8ab',planned:'#a1baca'};
      block(group,x,y,23,17,22,{roof:colors[slot.display.state]??colors.fog,front:'#728782',side:'#435f62'});
    }
    group.append(svg('text',{x:103,y:139,class:'svg-label','text-anchor':'middle'},site.title));
    group.append(svg('text',{x:103,y:160,class:'svg-caption','text-anchor':'middle'},`관측 ${project?.observed_slots??0} · 견본 ${project?.sample_slots??0}`));
    const choose=()=>{selected=site.id;render();};group.addEventListener('click',choose);
    group.addEventListener('keydown',event=>{if(['Enter',' '].includes(event.key)){event.preventDefault();choose();}});
    viewport.append(group);
  }
  viewport.append(svg('text',{x:80,y:710,fill:'#69929a','font-size':13,'letter-spacing':7,transform:'rotate(23 80 710)'},'COASTAL RESEARCH CAMPUS'));
}
function renderDetail() {
  const site=sites.find(row=>row.id===selected);
  const project=snapshot.projects.find(row=>row.project_code===selected);
  const detail=$('#project-detail');detail.replaceChildren(textNode('h2','산출물과 관측 근거'));
  if(inWorldTree && !visibleSites().length){detail.append(textNode('p','로그인한 계정의 과제 자료가 연결되면 부지와 근거를 표시합니다.'));return;}
  const counts=textNode('div','','counts');
  for(const [label,value] of [['관측 슬롯',project?.observed_slots??0],['신선한 충족·부재',project?.qualifying_observed_slots??0],['견본',project?.sample_slots??0]]){
    const count=textNode('span',label);count.prepend(textNode('strong',String(value)));counts.append(count);
  }
  detail.append(counts);
  if(!project?.slots?.length){detail.append(textNode('p','이 부지의 관측 자료가 아직 연결되지 않았습니다. 자료가 없다는 사실을 업무 부재나 완료로 바꾸지 않습니다.'));return;}
  detail.append(textNode('p',`기준 시각 ${project.observed_at}. 오래된 근거는 미확인으로 표시합니다.`));
  const list=textNode('ul','','slot-list');
  for(const slot of project.slots){
    const li=document.createElement('li');const button=textNode('button',slot.artifact_family_id);button.type='button';button.setAttribute('aria-expanded','false');
    button.append(textNode('small',`${slot.stage_code} · ${slot.display.label}`));
    button.addEventListener('click',()=>{
      detail.querySelector('.slot-evidence')?.remove();const evidence=textNode('div','','slot-evidence');
      list.querySelector('[aria-expanded="true"]')?.setAttribute('aria-expanded','false');
      button.setAttribute('aria-expanded','true');
      evidence.tabIndex=-1;evidence.setAttribute('role','region');evidence.setAttribute('aria-label',`${slot.artifact_family_id} 근거 상세`);
      evidence.append(textNode('h2',`${site.title} / ${slot.artifact_family_id}`),textNode('p',`${slot.display.label} · ${slot.display.acceptance_label}`),
        textNode('p',`근거 셀 ${slot.cell_count} · 관측 ${slot.observation_count} · ${slot.source_observed_at}`));
      for(const ref of slot.evidence_refs??[])evidence.append(textNode('p',ref));
      // Keep details beside the selected slot, within the scrollable panel.
      li.append(evidence);evidence.scrollIntoView({block:'nearest',inline:'nearest'});evidence.focus({preventScroll:true});
      evidence.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();button.focus();}});
    });li.append(button);list.append(li);
  }detail.append(list);
}
function render(){
  const focusedSite=document.activeElement?.getAttribute('data-site');
  const container=$('#sites');container.replaceChildren();
  const shown = visibleSites();
  if(!shown.some(site => site.id === selected)) selected = shown[0]?.id ?? null;
  for(const site of shown){const button=textNode('button','','site-button');button.type='button';
    button.dataset.site=site.id;button.setAttribute('aria-pressed',String(site.id===selected));
    if(site.id===selected)button.classList.add('selected');button.append(textNode('strong',site.title),textNode('small',site.subtitle));
    button.addEventListener('click',()=>{selected=site.id;render();});container.append(button);}
  drawScene();renderDetail();
  if(focusedSite)[...container.children].find(button=>button.dataset.site===focusedSite)?.focus();
}
async function refresh(){
  $('#refresh').disabled=true;
  try{const response=await fetch(inWorldTree ? '/api/forge-world/coverage' : '/project-coverage.snapshot.json',{cache:'no-store',credentials:'same-origin'});
    if(!response.ok)throw new Error(response.status === 401 ? 'login_required' : 'unavailable');const data=await response.json();
    if(data.schema_version!=='soulforge.forge_world.projects.v1'||!Array.isArray(data.projects))throw new Error('unavailable');
    snapshot=data;$('#read-time').textContent=`읽은 시각 ${new Date(data.read_at).toLocaleString('ko-KR')}`;
    const available=data.projects.filter(project=>project.state==='available').length;
    $('#coverage-summary').textContent=`${available}개 과제 자료 연결 · 미연결 ${Math.max(0,visibleSites().length-available)}개. 관측의 신선도는 원천 시각으로 판단합니다.`;
  }catch(error){snapshot={projects:[]};$('#read-time').textContent=error.message==='login_required'?'로그인이 필요합니다':'관측 자료를 읽을 수 없음';$('#coverage-summary').textContent=error.message==='login_required'?'자료·검토 화면에서 로그인한 뒤 새로 읽어 주세요.':'연결 실패 · 새로 읽기로 다시 확인할 수 있습니다.';}
  finally{$('#refresh').disabled=false;render();}
}
function zoom(delta){scale=Math.max(1,Math.min(1.6,scale+delta));$('#world').setAttribute('viewBox',`${720-720/scale} ${450-450/scale} ${1440/scale} ${900/scale}`);}
$('#refresh').addEventListener('click',refresh);$('#zoom-in').addEventListener('click',()=>zoom(.15));$('#zoom-out').addEventListener('click',()=>zoom(-.15));
$('#reset-view').addEventListener('click',()=>{scale=1;zoom(0);});render();void refresh();
