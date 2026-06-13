# dev-erp SE 엔진 빌드 플랜 (1~4 기능, 2026-06-14)

- 작성: claude_opus-4-8 (Code, 1M) — 멀티에이전트 설계(코드 직접 근거) 종합
- 지위: **buildable 설계(확정 전 owner 결정 필요).** 정본 설계는 `DESIGN.md`. 비전 인덱스는 `CAPABILITY_VISION_20260614.md`.
- 범위: 기능 ①SE 자동 스케줄러 ②기술자료 완결성 게이트 ③재사용 라이브러리 ④캐비넷 재고. (⑤~⑭은 다음 consolidation)
- 경계: public-safe. 코어 LLM 0%(AI는 ai_proposal 큐→사람 승인). 원문 미저장 포인터. DESIGN(canon) 갱신은 owner 서명 후.

## 통합 정체성

"받은 메일"이 아니라 **"SE 프로세스 규정 그 자체가 일의 발원지"**. SE 8단계(030 SRR~240 LL)·산출물 절차(7스텝)·보드 유형별 필수 기술자료 세트를 **코드가 아니라 데이터(템플릿·requirement·앵커)로 인코딩** → 과제에 단계 템플릿을 적용하면 산출물 할일이 마감과 함께 자동 출몰(메일 없이도 일이 생김), 마일스톤 날짜가 흔들리면 마감이 전파, 각 단계 게이트는 BOM·Gerber·Digikey·회로도·PCB·블록다이어그램을 `core_attachment` 포인터로 판정해 미충족이면 빨갛게(보스 HP) hard 차단 → "작성을 놓치지 않게 강제". 그 보드/부품은 재사용 라이브러리(`core_part`+`bom_edge`+리비전)로 누적·역참조, 실물은 캐비넷/칸 위에서 '누가·언제·몇 개·어느 과제로' 차감 트랜잭션으로만 출고, 안전재고 미달은 콕핏 자동 통지.

## 키스톤 (가장 큰 미지수)

**"AI 제안→사람 승인"의 착지면이 코드에 없다.** 스케줄러 spawn·산출물 갭 제안·allegro 산출물 태깅·재고 재발주 제안이 전부 큐를 전제하는데 `ai_jobs` 테이블이 없음(개념만). 이 **proposal/approval 단일 표면**(테이블 `ai_proposal` 신설 vs `event_log kind='ai_proposal'` 재사용)과 **자동화 경계**(어디까지 자동 쓰기, 어디부터 사람 확정)를 정하지 못하면 스케줄러는 '심장'이 아니라 수동 버튼 더미가 된다. → owner 결정 #1.

## 데이터모델 델타 (기존 25테이블에 더할 것)

| 객체 | 종류 | 무엇 | 쓰임 |
|---|---|---|---|
| `core_stage.stage_code` | 컬럼 | 단계 식별을 title에서 분리(현재 gateEval이 title=stage_code 암묵결합). backfill=title | ①② 공유 척추 |
| `se_stage_template` / `_stage` / `se_deliverable_template` | 테이블 3 | SE 단계 규칙을 데이터로(헤더 / stage_code·seq·is_milestone / anchor_stage_code·offset_days·deliverable·default_artifact_type). guide.mjs SE_STAGES + se_foldertree YAML에서 시드 | ① |
| `core_item.anchor_date/anchor_stage_code/offset_days/due_overridden` | 컬럼 4 | 마감의 진실 소스를 마일스톤 기준으로. set-anchor가 due=anchor+offset 재계산, overridden·done 보호 | ① |
| `artifact_requirement` | 테이블 | 보드유형·단계별 필수 세트(scope_kind 'stage'|'board_type', artifact_type bom/gerber/digikey/schematic/pcb/block_diagram, mode hard/soft) | ② |
| `core_attachment.artifact_type` | 컬럼 | 첨부에 의미태그 → 충족 판정 키(새 매핑테이블 없이 기존 첨부 재해석) | ②③ |
| `core_attachment` entity_type='part' | 화이트리스트 | 보드/부품(core_part)에 직접 첨부 허용(스키마 변경 0) | ②③ |
| `core_part.revision/is_library/library` | 컬럼 3 | 공유마스터를 라이브러리 뷰로(판 누적·등재구분·서고분류 3축) | ③ |
| `core_location kind='cabinet'/'bin'` | 도메인값 | 캐비넷/칸을 기존 위치트리(parent_id)로 표현, ALTER 불필요 | ④ |
| `event_log kind='stock_txn'/'stock_low'` | 이벤트종류 | 출고/입고·부족알림을 새 테이블 0으로(actor=출고자·델타·과제·사유) | ④ |
| rbac seed: junior/dispatcher/senior + stock.record/dispatch/view | 시드 | 막내=기록만/출고담당=차감/고참=조회. 출고 라우트 1곳 서버측 권한 강제(현 RBAC는 클라 표시뿐) | ④ |
| `ai_proposal` (또는 event_log 재사용) | 테이블? | AI 제안→승인 단일 착지면. **owner 결정 #1** | ①②④ |

## 빌드 순서 (MVP-first, 의존성 고려)

- **P-0 공유 척추** — `core_stage.stage_code` 컬럼화 + backfill. *가장 작고 안전한 선행.* ①②가 둘 다 stage_code를 키로 쓰므로 title 결합을 먼저 끊는다(안 하면 title 변경이 게이트를 깨는 버그가 양쪽에 박힘).
- **P-1 ②완결성 게이트 MVP** — `artifact_requirement` + `core_attachment.artifact_type` + entity_type='part' + gateEval `required_artifacts_missing` reason. 보드 1개에 필수 6종 → 미충족 빨갛게 + hard 차단, 6종 첨부 시 통과. *owner 핵심('놓치지 않게 강제')을 가장 빨리 시연.*
- **P-2 ①스케줄러 심장 MVP** — `se_stage_template` 3테이블 + `core_item` 앵커 4컬럼. 1 템플릿(120 CDR) applyTemplate → 산출물 할일 자동 spawn → set-anchor 1-hop 전파. *게이트(P-1)가 먼저 서야 낳은 일이 게이트와 연결돼 '낳고-강제' 고리가 닫힘.*
- **P-3 ④캐비넷 출고 MVP** — issueStock 트랜잭션 + stock_txn 이벤트 + 출고 라우트 서버권한 1줄 + stock_low 알림. *섹터4 독립축이라 P-1/P-2와 병렬 가능하나 우선순위 뒤.*
- **P-4 ③라이브러리 뷰 + `ai_proposal` 표면 통합** — core_part 3컬럼 + 라이브러리 탭 + /api/parts/usage 역참조. 그리고 ai_proposal 표면 신설로 갭 스캔·dlib 태깅·재발주 제안을 한 곳에 착지→승인→쓰기. *자동화 절반이 여기서 닫힘.*

## 기능 간 교차 연결

- ①의 `se_deliverable_template.default_artifact_type` ↔ ②의 `artifact_requirement.artifact_type`: 같은 어휘(bom/gerber/…) 공유 — 낳는 쪽과 막는 쪽이 어긋나면 안 됨.
- ②의 충족 키(part 첨부) ↔ ③ 라이브러리 보드 산출물: 라이브러리에 누적된 보드 첨부가 그대로 게이트 충족 증거.
- ③ ↔ ④: 출고 품목과 부품 마스터가 동일 core_part. min_qty=알림 분모, bom_edge=부족 계산 소스.
- ①②의 공유 척추 = `core_stage.stage_code`.

## owner 결정 필요 (5)

1. **ai_proposal 착지면**(테이블 신설 vs event_log 재사용) + 스케줄러 자동화 경계(어디까지 자동, 어디부터 사람 확정).
2. 필수 산출물 세트 1차 정본을 **보드유형별** vs **단계별**, board_type 결정 규칙(type/grp/별도분류 수신부·신호처리·전원).
3. 마감 전파 단위(영업일 vs 달력일), 앵커를 회의/검토일 vs 발주/납기에. 8단계 캐스케이드 개방 시점.
4. 출고 3역할(junior/dispatcher/senior) ↔ 기존 core_person.role 매핑(누가 어느 역할). 가용초과 출고 거부 vs 마이너스 기록.
5. 리비전 식별(part_no 그룹핑 vs supersedes_id 링크), 캐비넷 위치 깊이(창고>랙>캐비넷>칸 + 서랍/트레이?).

## 다음

- ⑤~⑭ + claude 제안까지 묶는 전체 consolidation(데이터모델 통합·MVP 순서 확장).
- owner 결정 후 P-0부터 슬라이스 실행(슬라이스별 node:test + verify_gate + commit).
