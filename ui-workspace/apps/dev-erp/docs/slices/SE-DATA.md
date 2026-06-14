# SE-DATA — SE 프로세스 시드를 data/se_process_seed.json 에서 openStore 시드로 배선(파일 부재 시 기존 120_CDR stub 유지, 멱등)

- **phase**: GATE/스케줄
- **depends_on**: 없음
- **parallel_group**: G-store
- **owner_decision**: none (파일 부재 시 stub 유지가 안전 기본. 8단계 전체 시드 내용은 Codex 데이터 파일 책임 — 이 패킷은 '읽는 배선'만).

## allowed_write_paths
- ui-workspace/apps/dev-erp/src/store.mjs
- ui-workspace/apps/dev-erp/test/core.test.mjs

## summary
openStore() 의 120_CDR 하드코딩 시드(store.mjs L378-383)를 외부 데이터 파일 data/se_process_seed.json(Codex 작성, 8단계 SE_STAGES + deliverable + board_requirements)을 읽어 소비하도록 배선한다. 파일 부재 시(현 상태) 기존 120_CDR stub 그대로 유지(하위호환). 모든 시드는 INSERT OR IGNORE / ON CONFLICT 라 재기동 멱등. node:fs 외 새 의존 0. default_artifact_type 와 artifact_requirement.artifact_type 는 동일 6종 사전 공유.

## data_model
- DDL/ALTER 없음 — se_stage_template / se_stage_template_stage / se_deliverable_template / artifact_requirement 를 데이터로만 채운다.
- data/se_process_seed.json 계약(읽는 형태): { templates:[{key,name,stages:[{stage_code,seq,is_milestone}],deliverables:[{anchor_stage_code,offset_days,deliverable_name,default_artifact_type}]}], board_requirements:[{scope_kind,scope_key,artifact_type,label,mode,seq}] }.
- artifact_type/default_artifact_type 허용 사전: bom|gerber|digikey|schematic|pcb|block_diagram. 사전 밖 값은 INSERT 는 하되(자유 TEXT) lexicon 매핑 변경 0.

## code_changes
- store.mjs import 블록(L5-6) 다음에 `import { readFileSync, existsSync } from 'node:fs'; import { dirname, join } from 'node:path'; import { fileURLToPath } from 'node:url';` 추가(zero-dependency 유지, store.mjs 는 현재 node:fs 미import 임을 확인했으므로 신규 import).
- store.mjs openStore(): 기존 120_CDR 시드 블록(L378-383)을 `try { seedSeProcess(db); } catch {}` 로 교체(같은 자리, 멱등·실패 무해).
- store.mjs module-scope 헬퍼 function seedSeProcess(db)(클래스 메서드 아님, 가드⑥ 무관): (1) seedPath=join(dirname(fileURLToPath(import.meta.url)),'..','data','se_process_seed.json'). (2) !existsSync→기존 stub(L379-382 동일 SQL: 120_CDR/120 milestone/3 deliverable) INSERT OR IGNORE 후 return. (3) JSON.parse(readFileSync(seedPath,'utf-8')) try/catch, 실패 시 stub fallback. (4) data.templates: INSERT OR IGNORE se_stage_template(key,name); stages→se_stage_template_stage(template_key,stage_code,seq,is_milestone); deliverables→se_deliverable_template(template_key,anchor_stage_code,offset_days,deliverable_name,default_artifact_type). (5) data.board_requirements: db 직접 INSERT INTO artifact_requirement(...) ON CONFLICT(scope_kind,scope_key,artifact_type) DO UPDATE SET label,mode,seq(setArtifactRequirement 동일 패턴, store 인스턴스 없으니 db 직접).

## test_cases
- 'SE-DATA: 시드 파일 부재 시 기존 120_CDR stub 유지(하위호환)': freshStore()(=openStore(':memory:'), 디스크 data/se_process_seed.json 부재 가정). assert store.scheduleTemplates() 에 key='120_CDR' 1건, stages stage_code='120' is_milestone=1, deliverables 3건(회로도 초안 -7, CDR 패키지 0, 시험계획서 14). 기존 P-2 stub 회귀 확인.
- 'SE-DATA: seedSeProcess 멱등': openStore(':memory:') 두 번 호출 후 각 store.scheduleTemplates() 길이 동일, INSERT OR IGNORE 중복 0. 같은 store artifact_requirement 행 수 불변.
- 'SE-DATA: 어휘 정합 — default_artifact_type ⊂ artifact_requirement.artifact_type 사전': freshStore(); const dels=store.scheduleTemplates().flatMap(t=>t.deliverables); 기대: dels 의 non-null default_artifact_type 전부가 ['bom','gerber','digikey','schematic','pcb','block_diagram'] 에 포함.

## acceptance_checks
- cd ui-workspace/apps/dev-erp && node --test test/core.test.mjs 전건 green(48+≥2).
- 기존 P-2 테스트('SE 스케줄러 — 템플릿 적용 자동 spawn')가 변경 없이 통과(120_CDR stub 동일성).
- data/se_process_seed.json 부재 상태에서 node server.mjs --db :memory: 기동 시 콘솔 에러 0, /api/schedule/templates 가 120_CDR 반환.
- store.mjs 새 npm import 0(node:fs/path/url 만 추가).

## stop_conditions
se_process_seed.json 형식이 Codex 측에서 위 계약과 다르게 확정된 근거(data/ 에 다른 스키마 파일 존재)가 보이면 멈추고 보고. 시드가 artifact_type 사전 밖 값을 강제하면 멈추고 owner 확인.

## guards
- ① zero-dependency: node:fs/path/url 만 추가, 새 npm 0, gateway import 0
- ⑤ ALTER 멱등: try/catch + INSERT OR IGNORE / ON CONFLICT
- ⑥ gateEval/clearStage/gateMode 신규 함수 0(시드 헬퍼만)
- ④ event_log: 시드는 이벤트 미기록
- ③ 원문 미저장: 시드는 메타 정의만
- ⑦ .registry/.unit read-only: dev-erp data/ 안에서만 소비
- ⑧ node:test 전건 green + 표기 commit+push
