import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=fileURLToPath(new URL('../../../',import.meta.url));
const child=path.join(root,'guild_hall/tool_workshop/src/hwpx_reference_child.py');
const scripts=path.join(root,'.registry/skills/hwpx_document/codex/scripts');
const templates=path.join(root,'.registry/skills/hwpx_document/codex/templates/base');
const python=process.env.SOULFORGE_HWPX_TEST_PYTHON;
const probe=python && existsSync(python)?spawnSync(python,['-I','-B','-c','import lxml;print("ready")'],{encoding:'utf8',timeout:5000,windowsHide:true}):null;
const available=probe?.status===0 && probe.stdout.trim()==='ready';
const fixtureCode=String.raw`
import hashlib,json,pathlib,sys,zipfile,xml.etree.ElementTree as ET
root,templates,scenario=pathlib.Path(sys.argv[1]),pathlib.Path(sys.argv[2]),sys.argv[3]
parts={p.relative_to(templates).as_posix():p.read_bytes() for p in templates.rglob('*') if p.is_file()}
HP='http://www.hancom.co.kr/hwpml/2011/paragraph'
HS='http://www.hancom.co.kr/hwpml/2011/section'
def paragraph(text):return '<hp:p pageBreak="0" columnBreak="0"><hp:run><hp:t>'+text+'</hp:t></hp:run></hp:p>'
def section(number,word):
    texts=[word+' 문서는 여러 문단과 표를 포함하는 한국어 합성 검토 결과입니다.',word+' 시험 결과와 확인 사항을 충분한 길이의 설명으로 기록합니다.',word+' 다음 검토에서는 모든 구역의 구조와 내용을 함께 확인합니다.']
    rows=''.join('<hp:tr>'+''.join('<hp:tc>'+paragraph('항목 '+str(r)+' 결과 '+str(c))+'</hp:tc>' for c in range(2))+'</hp:tr>' for r in range(3))
    table='<hp:p><hp:run><hp:tbl rowCnt="3" colCnt="2" repeatHeader="1" pageBreak="CELL"><hp:sz width="42520" height="12000"/>'+rows+'</hp:tbl></hp:run></hp:p>'
    return ('<?xml version="1.0" encoding="UTF-8"?><hs:sec xmlns:hs="'+HS+'" xmlns:hp="'+HP+'">'+''.join(paragraph(t) for t in texts)+table+'</hs:sec>').encode()
parts['Contents/header.xml']=parts['Contents/header.xml'].replace(b'secCnt="1"',b'secCnt="2"')
parts['Contents/content.hpf']=parts['Contents/content.hpf'].replace(b'</opf:manifest>',b'<opf:item id="section1" href="Contents/section1.xml" media-type="application/xml"/></opf:manifest>').replace(b'</opf:spine>',b'<opf:itemref idref="section1" linear="yes"/></opf:spine>')
parts['Contents/section0.xml']=section(0,'기준')
parts['Contents/section1.xml']=section(1,'기준')
after=dict(parts)
after['Contents/section0.xml']=section(0,'후보')
after['Contents/section1.xml']=section(1,'후보')
allowed=['Contents/section0.xml','Contents/section1.xml']
if scenario=='unchanged':after=dict(parts)
if scenario=='immutable':after['Contents/header.xml']+=b' '
if scenario=='disallowed_section':allowed=['Contents/section0.xml']
if scenario=='external':after['Contents/section1.xml']=after['Contents/section1.xml'].replace(b'<hp:run>',b'<hp:run href="https://invalid.example/private">',1)
if scenario=='second_section_drift':after['Contents/section1.xml']=after['Contents/section1.xml'].replace(b'</hs:sec>',paragraph('둘째 구역에 잘못 추가한 문단입니다.').encode()+b'</hs:sec>')
if scenario=='membership':after['Contents/section2.xml']=section(2,'추가')
if scenario=='active':after['Scripts/evil.js']=b'not executed'
if scenario=='traversal':after['../outside.xml']=b'<x/>'
if scenario=='zipbomb':after['BinData/bomb.png']=b'A'*(2*1024*1024)
if scenario=='canonical_invalid':parts['mimetype']=after['mimetype']=b'application/not-hwpx'
if scenario=='dtd':after['Contents/section0.xml']=after['Contents/section0.xml'].replace(b'?>',b'?><!DOCTYPE hs:sec [<!ENTITY unsafe "no">]>',1)
def save(file,entries):
    with zipfile.ZipFile(file,'x') as z:
        for name in ['mimetype']+sorted(set(entries)-{'mimetype'}):
            info=zipfile.ZipInfo(name);info.external_attr=0o100600<<16;info.compress_type=zipfile.ZIP_DEFLATED if scenario=='zipbomb' and name=='BinData/bomb.png' else zipfile.ZIP_STORED
            z.writestr(info,entries[name])
        if file.name=='candidate.hwpx' and scenario=='duplicate':z.writestr('Contents/section0.xml',entries['Contents/section0.xml'])
        if file.name=='candidate.hwpx' and scenario=='ziplink':
            info=zipfile.ZipInfo('BinData/link.png');info.create_system=3;info.external_attr=0o120777<<16;z.writestr(info,b'not a link target')
save(root/'reference.hwpx',parts);save(root/'candidate.hwpx',after)
texts=[]
for name in ['Contents/section0.xml','Contents/section1.xml']:
    if name in after:texts += [''.join(n.itertext()) for n in ET.fromstring(after[name]).iter('{'+HP+'}t')]
request={'reference_sha256':hashlib.sha256((root/'reference.hwpx').read_bytes()).hexdigest(),'candidate_sha256':hashlib.sha256((root/'candidate.hwpx').read_bytes()).hexdigest(),'allowed_parts':allowed,'expected_text':texts}
if scenario=='wrong_hash':request['candidate_sha256']='0'*64
if scenario=='text_mismatch':request['expected_text'][0]='다른 내용'
(root/'request.json').write_text(json.dumps(request,ensure_ascii=False),encoding='utf-8')
`;

function run(scenario) {
  const runRoot=mkdtempSync(path.join(tmpdir(),'hwpx-reference-'));
  const fixture=spawnSync(python,['-I','-B','-c',fixtureCode,runRoot,templates,scenario],{encoding:'utf8',timeout:10000,windowsHide:true});
  assert.equal(fixture.status,0,fixture.stderr);
  const request=path.join(runRoot,'request.json');
  const result=spawnSync(python,['-I','-B',child,'verify',request,scripts,runRoot],{encoding:'utf8',timeout:10000,windowsHide:true});
  assert.ok(result.stdout.length<2048);assert.equal(result.stderr,'');
  const receipt=JSON.parse(result.stdout);
  assert.ok(!result.stdout.includes(runRoot) && !result.stdout.includes('여러 문단'));
  return {runRoot,request,result,receipt};
}

if(!available) {
  test('reference HWPX child requires configured Python with lxml',{skip:'SOULFORGE_HWPX_TEST_PYTHON or its lxml dependency unavailable'},()=>{});
} else {
  test('actual canonical functions accept Korean paragraphs, 3x2 table and both sections; preview remains stale',()=>{
    const {runRoot,result,receipt}=run('pass');
    assert.equal(result.status,0);assert.equal(receipt.ok,true);
    assert.equal(receipt.section_count,2);assert.equal(receipt.changed_section_count,2);
    assert.equal(receipt.text_node_count,18);assert.equal(receipt.page_guard,'passed_all_sections');
    assert.equal(receipt.canonical_validation,'passed');assert.equal(receipt.preview_status,'preview_stale');
    assert.equal(receipt.render_required,true);assert.equal(receipt.page_count_verified,false);
    assert.equal(receipt.validation_level,'structural_reference_only');
    assert.deepEqual(readdirSync(path.join(runRoot,'reference-metrics')).sort(),['candidate-0.hwpx','candidate-1.hwpx','reference-0.hwpx','reference-1.hwpx']);
  });
  test('unchanged preview is explicitly unverified, not a page/render acceptance',()=>{
    const {result,receipt}=run('unchanged');assert.equal(result.status,0);
    assert.equal(receipt.preview_status,'present_unverified');assert.equal(receipt.changed_section_count,0);assert.equal(receipt.render_required,true);
  });
  for(const [scenario,code] of [
    ['wrong_hash','hash_mismatch'],['immutable','immutable_part_changed'],['disallowed_section','immutable_part_changed'],
    ['external','external_reference'],['second_section_drift','page_guard_failed'],['membership','section_membership_invalid'],
    ['text_mismatch','text_readback_mismatch'],['canonical_invalid','canonical_validation_failed'],['active','active_part_forbidden'],
    ['traversal','zip_path_invalid'],['duplicate','zip_members_invalid'],['ziplink','zip_link_forbidden'],['zipbomb','zip_limit'],['dtd','xml_unsafe'],
  ])test(`bounded reference admission rejects ${scenario}`,()=>{
    const {result,receipt}=run(scenario);assert.equal(result.status,1);assert.deepEqual(receipt,{ok:false,code});
  });
  test('section metric outputs are create-only and repeated verify cannot overwrite them',()=>{
    const {runRoot,request}=run('pass');
    const metric=path.join(runRoot,'reference-metrics','candidate-1.hwpx'),before=readFileSync(metric);
    const repeated=spawnSync(python,['-I','-B',child,'verify',request,scripts,runRoot],{encoding:'utf8',timeout:10000,windowsHide:true});
    assert.equal(repeated.status,1);assert.equal(JSON.parse(repeated.stdout).ok,false);assert.deepEqual(readFileSync(metric),before);
  });
}
